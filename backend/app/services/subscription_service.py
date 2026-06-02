"""
Subscription business logic service.
Owns all subscription state transitions and access control decisions.
"""

import json
import logging
import math
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.database.connection import AsyncSessionLocal, redis_manager
from app.database.models import Subscription, SubscriptionEvent, User

logger = logging.getLogger(__name__)

SUBSCRIPTION_CACHE_TTL = 300  # 5 minutes

# Statuses that grant access (DB-stored values only).
# "pending" = Razorpay is retrying a failed charge; access continues until "halted".
# Note: "trial_active" and "admin_exempt" are virtual statuses computed at response
# time — they never appear in Subscription.status and are handled separately in
# is_access_granted() and get_subscription_status().
ACTIVE_STATUSES = {"active", "authenticated", "pending"}


class SubscriptionNotFoundError(Exception):
    """Raised when a webhook references a subscription unknown to us."""


def _ts(unix: Optional[int]) -> Optional[datetime]:
    """Convert a nullable Unix timestamp to a UTC-aware datetime."""
    return datetime.fromtimestamp(unix, tz=timezone.utc) if unix else None


class SubscriptionService:

    # -- Cache helpers --

    @staticmethod
    def _cache_key(user_id: str) -> str:
        return f"subscription:{user_id}"

    @staticmethod
    async def _cache_status(user_id: str, is_active: bool, data: dict) -> None:
        payload = {"is_active": is_active, **data}
        await redis_manager.set(
            SubscriptionService._cache_key(user_id),
            json.dumps(payload, default=str),
            SUBSCRIPTION_CACHE_TTL,
        )

    @staticmethod
    async def _get_cached_status(user_id: str) -> Optional[dict]:
        raw = await redis_manager.get(SubscriptionService._cache_key(user_id))
        if raw:
            try:
                return json.loads(raw)
            except Exception:
                pass
        return None

    @staticmethod
    async def invalidate_cache(user_id: str) -> None:
        await redis_manager.delete(SubscriptionService._cache_key(user_id))

    # -- Core access check --

    @staticmethod
    async def is_access_granted(user_id: str, is_admin: bool) -> bool:
        """
        Returns True if user can access protected resources.
        Check order: admin → cache → trial → subscription.
        """
        if is_admin:
            return True

        cached = await SubscriptionService._get_cached_status(user_id)
        if cached is not None:
            # Re-check trial expiry from cache
            if cached.get("trial_active"):
                try:
                    ends = SubscriptionService._ensure_utc(datetime.fromisoformat(cached["trial_ends_at"]))
                    if datetime.now(timezone.utc) >= ends:
                        await SubscriptionService.invalidate_cache(user_id)
                        # Fall through to DB check
                    else:
                        return True
                except (ValueError, TypeError):
                    pass
            # Re-check cancelled subscriptions for period expiry
            elif cached.get("status") == "cancelled" and cached.get("current_period_end"):
                try:
                    period_end = SubscriptionService._ensure_utc(datetime.fromisoformat(cached["current_period_end"]))
                    if datetime.now(timezone.utc) >= period_end:
                        await SubscriptionService.invalidate_cache(user_id)
                        # Fall through to DB check below
                    else:
                        return True
                except (ValueError, TypeError):
                    return cached.get("is_active", False)
            else:
                return cached.get("is_active", False)

        # Cache miss: check trial and subscription in parallel
        import asyncio
        (_, trial_active, trial_ends_at), sub = await asyncio.gather(
            SubscriptionService._check_trial(user_id),
            SubscriptionService.get_subscription(user_id),
        )
        if trial_active:
            await SubscriptionService._cache_status(user_id, True, {
                "status": "trial_active",
                "trial_active": True,
                "trial_ends_at": trial_ends_at.isoformat() if trial_ends_at else None,
            })
            return True
        if not sub:
            await SubscriptionService._cache_status(user_id, False, {"status": "none"})
            return False

        is_active = sub.status in ACTIVE_STATUSES
        # Cancelled but still within paid period
        if sub.status == "cancelled" and sub.current_period_end:
            now = datetime.now(timezone.utc)
            period_end = SubscriptionService._ensure_utc(sub.current_period_end)
            if now < period_end:
                is_active = True

        await SubscriptionService._cache_status(user_id, is_active, {
            "status": sub.status,
            "plan_type": sub.plan_type,
            "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        })
        return is_active

    @staticmethod
    def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
        """Normalize a nullable datetime to UTC-aware."""
        if dt is None:
            return None
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt

    @staticmethod
    async def _check_trial(user_id: str) -> tuple:
        """Returns (has_trial: bool, is_active: bool, ends_at: datetime | None)."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User.trial_started_at, User.trial_ends_at).filter_by(id=user_id)
            )
            row = result.one_or_none()
        if not row or row.trial_started_at is None:
            return False, False, None
        ends_at = SubscriptionService._ensure_utc(row.trial_ends_at)
        is_active = ends_at is not None and datetime.now(timezone.utc) < ends_at
        return True, is_active, ends_at

    # -- CRUD --

    @staticmethod
    async def get_subscription(user_id: str) -> Optional[Subscription]:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Subscription).filter_by(user_id=user_id)
            )
            return result.scalar_one_or_none()

    # -- Trial --

    @staticmethod
    async def claim_trial(user_id: str) -> datetime:
        """
        Claim the free trial. Idempotent — returns existing trial_ends_at if already claimed.
        Raises ValueError if promo is not active.
        """
        import asyncio
        from app.services.platform_settings_service import PlatformSettingsService

        promo_active, duration_days = await asyncio.gather(
            PlatformSettingsService.is_trial_promo_active(),
            PlatformSettingsService.get_trial_duration_days(),
        )
        if not promo_active:
            raise ValueError("Free trial is not currently available")

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).filter_by(id=user_id).with_for_update()
            )
            user = result.scalar_one_or_none()
            if not user:
                raise ValueError("User not found")
            if user.trial_started_at is not None:
                return SubscriptionService._ensure_utc(user.trial_ends_at)  # Already claimed — idempotent
            now = datetime.utcnow()  # Naive UTC to match existing model columns
            user.trial_started_at = now
            user.trial_ends_at = now + timedelta(days=duration_days)
            await session.commit()
            ends_at = user.trial_ends_at

        await SubscriptionService.invalidate_cache(user_id)
        logger.info(f"Trial claimed for user {user_id}: ends at {ends_at}")
        return ends_at

    @staticmethod
    def _days_remaining(ends_at: Optional[datetime]) -> int:
        """Compute whole days remaining until ends_at (ceiling). Returns 0 if expired/None."""
        if not ends_at:
            return 0
        ends_at = SubscriptionService._ensure_utc(ends_at)
        secs = max(0, (ends_at - datetime.now(timezone.utc)).total_seconds())
        return math.ceil(secs / 86400) if secs > 0 else 0

    @staticmethod
    async def get_trial_status(user_id: str) -> dict:
        """Returns trial state dict. Delegates to _check_trial to avoid duplicate queries."""
        has_trial, is_active, ends_at = await SubscriptionService._check_trial(user_id)
        if not has_trial:
            return {"has_trial": False, "is_active": False, "ends_at": None, "days_remaining": 0}
        return {
            "has_trial": True,
            "is_active": is_active,
            "ends_at": ends_at.isoformat() if ends_at else None,
            "days_remaining": SubscriptionService._days_remaining(ends_at) if is_active else 0,
        }

    @staticmethod
    async def create_or_update_subscription(
        user_id: str,
        razorpay_subscription_id: str,
        razorpay_plan_id: str,
        plan_type: str,
        status: str = "created",
    ) -> Subscription:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Subscription).filter_by(user_id=user_id)
            )
            sub = result.scalar_one_or_none()

            old_razorpay_id = None
            if sub:
                old_razorpay_id = sub.razorpay_subscription_id
                sub.razorpay_subscription_id = razorpay_subscription_id
                sub.razorpay_plan_id = razorpay_plan_id
                sub.plan_type = plan_type
                sub.status = status
                sub.updated_at = datetime.utcnow()
            else:
                sub = Subscription(
                    user_id=user_id,
                    razorpay_subscription_id=razorpay_subscription_id,
                    razorpay_plan_id=razorpay_plan_id,
                    plan_type=plan_type,
                    status=status,
                )
                session.add(sub)

            await session.commit()
            await session.refresh(sub)
            await SubscriptionService.invalidate_cache(user_id)

        # Cancel orphaned Razorpay subscription if we're replacing it
        if old_razorpay_id and old_razorpay_id != razorpay_subscription_id:
            try:
                from app.services.razorpay_service import RazorpayService
                await RazorpayService.cancel_subscription(old_razorpay_id, cancel_at_cycle_end=False)
                logger.info(f"Cancelled orphaned Razorpay subscription {old_razorpay_id}")
            except Exception as e:
                logger.warning(f"Failed to cancel orphaned subscription {old_razorpay_id}: {e}")

        return sub

    # -- Webhook handlers --

    @staticmethod
    async def handle_webhook_event(event_type: str, payload: Dict[str, Any], razorpay_event_id: Optional[str]) -> None:
        """
        Central dispatcher for all Razorpay webhook events.
        Idempotent: uses unique constraint on razorpay_event_id to prevent duplicate processing.
        """
        sub_entity = payload.get("payload", {}).get("subscription", {}).get("entity", {})
        razorpay_sub_id = sub_entity.get("id")

        if not razorpay_sub_id:
            logger.warning(f"Webhook {event_type} has no subscription entity")
            return

        # Find subscription by razorpay_subscription_id
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Subscription).filter_by(razorpay_subscription_id=razorpay_sub_id)
            )
            sub = result.scalar_one_or_none()

        if not sub:
            logger.warning(f"Webhook {event_type}: no local subscription for {razorpay_sub_id}")
            raise SubscriptionNotFoundError(f"No local subscription found for {razorpay_sub_id}")

        # Atomically record event (unique constraint on razorpay_event_id prevents duplicates)
        if razorpay_event_id:
            async with AsyncSessionLocal() as session:
                event = SubscriptionEvent(
                    subscription_id=sub.id,
                    user_id=sub.user_id,
                    razorpay_event_id=razorpay_event_id,
                    event_type=event_type,
                    event_payload=payload,
                )
                session.add(event)
                try:
                    await session.flush()
                except IntegrityError:
                    logger.info(f"Duplicate webhook event ignored: {razorpay_event_id}")
                    return
                await session.commit()
        else:
            logger.warning(f"Webhook {event_type} has no event ID — processing without idempotency guard")

        # Now safe to process — we hold the idempotency lock
        handler_map = {
            "subscription.authenticated": SubscriptionService._on_authenticated,
            "subscription.activated": SubscriptionService._on_activated,
            "subscription.charged": SubscriptionService._on_charged,
            "subscription.pending": SubscriptionService._on_pending,
            "subscription.halted": SubscriptionService._on_halted,
            "subscription.cancelled": SubscriptionService._on_cancelled,
            "subscription.completed": SubscriptionService._on_completed,
            "subscription.paused": SubscriptionService._on_paused,
            "subscription.resumed": SubscriptionService._on_resumed,
        }

        handler = handler_map.get(event_type)
        if handler:
            await handler(sub, sub_entity)
        else:
            logger.info(f"Unhandled webhook event type: {event_type}")

    @staticmethod
    async def _update_sub_status(sub: Subscription, new_status: str, extra: Optional[Dict] = None) -> None:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Subscription).filter_by(id=sub.id)
            )
            db_sub = result.scalar_one()
            db_sub.status = new_status
            db_sub.last_webhook_event = new_status
            db_sub.last_webhook_at = datetime.utcnow()
            db_sub.updated_at = datetime.utcnow()
            if extra:
                for k, v in extra.items():
                    setattr(db_sub, k, v)
            await session.commit()
        await SubscriptionService.invalidate_cache(sub.user_id)

    @staticmethod
    async def _on_authenticated(sub: Subscription, entity: dict) -> None:
        await SubscriptionService._update_sub_status(sub, "authenticated")
        # Finalize onboarding if user subscribed during preview (exitToPaywall path)
        try:
            from app.database.models import User
            async with AsyncSessionLocal() as session:
                result = await session.execute(select(User).filter_by(id=sub.user_id))
                user = result.scalar_one_or_none()
                if user and not user.onboarding_complete:
                    from app.services.onboarding_service import OnboardingService
                    await OnboardingService.mark_complete(sub.user_id)
        except Exception as e:
            logger.error(f"Failed to finalize onboarding on authenticated webhook: {e}", exc_info=True)

    @staticmethod
    async def _on_activated(sub: Subscription, entity: dict) -> None:
        await SubscriptionService._update_sub_status(sub, "active", {
            "charge_at": _ts(entity.get("charge_at")),
            "current_period_start": _ts(entity.get("current_start")),
            "current_period_end": _ts(entity.get("current_end")),
        })

    @staticmethod
    async def _on_charged(sub: Subscription, entity: dict) -> None:
        # Use Razorpay's paid_count if available; otherwise increment from fresh DB value
        razorpay_paid_count = entity.get("paid_count")
        extra: Dict[str, Any] = {
            "charge_at": _ts(entity.get("charge_at")),
            "current_period_start": _ts(entity.get("current_start")),
            "current_period_end": _ts(entity.get("current_end")),
        }
        if razorpay_paid_count is not None:
            extra["paid_count"] = razorpay_paid_count
        await SubscriptionService._update_sub_status_with_increment(
            sub, "active", extra, increment_paid=razorpay_paid_count is None
        )

    @staticmethod
    async def _update_sub_status_with_increment(
        sub: Subscription, new_status: str, extra: Optional[Dict] = None, increment_paid: bool = False
    ) -> None:
        """Like _update_sub_status but can atomically increment paid_count from fresh DB value."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Subscription).filter_by(id=sub.id)
            )
            db_sub = result.scalar_one()
            db_sub.status = new_status
            db_sub.last_webhook_event = new_status
            db_sub.last_webhook_at = datetime.utcnow()
            db_sub.updated_at = datetime.utcnow()
            if increment_paid:
                db_sub.paid_count = (db_sub.paid_count or 0) + 1
            if extra:
                for k, v in extra.items():
                    setattr(db_sub, k, v)
            await session.commit()
        await SubscriptionService.invalidate_cache(sub.user_id)

    @staticmethod
    async def _on_status_with_period_end(sub: Subscription, entity: dict, new_status: str) -> None:
        """Shared handler for pending/halted/paused — all extract current_end only."""
        await SubscriptionService._update_sub_status(sub, new_status, {
            "current_period_end": _ts(entity.get("current_end")),
        })

    @staticmethod
    async def _on_pending(sub: Subscription, entity: dict) -> None:
        await SubscriptionService._on_status_with_period_end(sub, entity, "pending")

    @staticmethod
    async def _on_halted(sub: Subscription, entity: dict) -> None:
        await SubscriptionService._on_status_with_period_end(sub, entity, "halted")

    @staticmethod
    async def _on_paused(sub: Subscription, entity: dict) -> None:
        await SubscriptionService._on_status_with_period_end(sub, entity, "paused")

    @staticmethod
    async def _on_cancelled(sub: Subscription, entity: dict) -> None:
        current_end = entity.get("current_end")
        # Single session: read fresh state, guard immediate cancel, then write.
        # Immediate cancel sets status=cancelled with period_end=None;
        # Razorpay's webhook still sends current_end=cycle_end which would re-grant access.
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Subscription).filter_by(id=sub.id)
            )
            db_sub = result.scalar_one()
            if current_end and db_sub.status == "cancelled" and db_sub.current_period_end is None:
                logger.info(f"Ignoring webhook current_end for immediate cancel {sub.razorpay_subscription_id}")
                return
            db_sub.status = "cancelled"
            db_sub.last_webhook_event = "cancelled"
            db_sub.last_webhook_at = datetime.utcnow()
            db_sub.updated_at = datetime.utcnow()
            if current_end:
                db_sub.current_period_end = _ts(current_end)
            await session.commit()
        await SubscriptionService.invalidate_cache(sub.user_id)

    @staticmethod
    async def _on_completed(sub: Subscription, entity: dict) -> None:
        await SubscriptionService._update_sub_status(sub, "completed")

    @staticmethod
    async def _on_resumed(sub: Subscription, entity: dict) -> None:
        await SubscriptionService._update_sub_status(sub, "active", {
            "charge_at": _ts(entity.get("charge_at")),
            "current_period_start": _ts(entity.get("current_start")),
            "current_period_end": _ts(entity.get("current_end")),
        })
