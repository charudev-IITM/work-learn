"""
Billing API endpoints — Razorpay subscription management.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel
from app.database.models import User
from app.database.connection import redis_manager
from app.services.razorpay_service import RazorpayService, RazorpayError
from app.services.subscription_service import SubscriptionService, SubscriptionNotFoundError, ACTIVE_STATUSES
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])


# -- Pydantic Schemas --

class CreateSubscriptionRequest(BaseModel):
    plan_type: str  # 'monthly' | 'annual'

class SubscriptionStatusResponse(BaseModel):
    has_subscription: bool
    status: Optional[str]
    plan_type: Optional[str]
    current_period_end: Optional[str]
    razorpay_subscription_id: Optional[str]
    checkout_key: str
    # Trial fields
    trial_ends_at: Optional[str] = None
    trial_days_remaining: int = 0
    free_trial_available: bool = False
    preview_enabled: bool = False

class CreateSubscriptionResponse(BaseModel):
    razorpay_subscription_id: str
    razorpay_plan_id: str
    checkout_key: str
    plan_type: str

class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_subscription_id: str
    razorpay_signature: str

class CancelSubscriptionRequest(BaseModel):
    cancel_at_cycle_end: bool = True

class MessageResponse(BaseModel):
    message: str

class ClaimTrialResponse(BaseModel):
    trial_ends_at: str
    days_remaining: int


# -- Endpoints --

@router.get("/status", response_model=SubscriptionStatusResponse)
async def get_subscription_status(current_user: User = Depends(get_current_user)):
    """Get current user's subscription status. Always succeeds (no subscription gate)."""
    from app.services.platform_settings_service import PlatformSettingsService

    checkout_key = RazorpayService.get_checkout_key()

    if current_user.is_admin:
        return SubscriptionStatusResponse(
            has_subscription=True,
            status="admin_exempt",
            plan_type=None,
            current_period_end=None,
            razorpay_subscription_id=None,
            checkout_key=checkout_key,
        )

    # Fetch trial, subscription, and platform settings in parallel (independent queries)
    trial, sub, promo_active, preview_on = await asyncio.gather(
        SubscriptionService.get_trial_status(current_user.id),
        SubscriptionService.get_subscription(current_user.id),
        PlatformSettingsService.is_trial_promo_active(),
        PlatformSettingsService.get_bool("preview_enabled", default=False),
    )
    free_trial_available = promo_active and not trial["has_trial"]
    sub_is_active = sub and sub.status in ACTIVE_STATUSES if sub else False

    if trial["is_active"] and not sub_is_active:
        return SubscriptionStatusResponse(
            has_subscription=False,
            status="trial_active",
            plan_type=None,
            current_period_end=None,
            razorpay_subscription_id=sub.razorpay_subscription_id if sub else None,
            checkout_key=checkout_key,
            trial_ends_at=trial["ends_at"],
            trial_days_remaining=trial["days_remaining"],
            free_trial_available=False,
            preview_enabled=preview_on,
        )

    if not sub:
        return SubscriptionStatusResponse(
            has_subscription=False,
            status="trial_expired" if trial["has_trial"] else None,
            plan_type=None,
            current_period_end=None,
            razorpay_subscription_id=None,
            checkout_key=checkout_key,
            trial_ends_at=trial["ends_at"],
            trial_days_remaining=0,
            free_trial_available=free_trial_available,
            preview_enabled=preview_on,
        )

    return SubscriptionStatusResponse(
        has_subscription=True,
        status=sub.status,
        plan_type=sub.plan_type,
        current_period_end=sub.current_period_end.isoformat() if sub.current_period_end else None,
        razorpay_subscription_id=sub.razorpay_subscription_id,
        checkout_key=checkout_key,
        trial_ends_at=trial["ends_at"],
        trial_days_remaining=trial["days_remaining"] if trial["is_active"] else 0,
        free_trial_available=free_trial_available,
        preview_enabled=preview_on,
    )


@router.post("/claim-trial", response_model=ClaimTrialResponse)
async def claim_trial(current_user: User = Depends(get_current_user)):
    """
    Claim the free trial. Idempotent.
    Also marks onboarding_complete=True if not already set.
    """
    try:
        ends_at = await SubscriptionService.claim_trial(current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    # Finalize onboarding if needed
    if not current_user.onboarding_complete:
        try:
            from app.services.onboarding_service import OnboardingService
            await OnboardingService.mark_complete(current_user.id)
        except Exception as e:
            logger.error(f"Failed to mark onboarding complete for trial user {current_user.id}: {e}")

    # Compute response from claim_trial's return value — no extra DB read
    # (claim_trial already guarantees UTC-aware datetime)
    return ClaimTrialResponse(
        trial_ends_at=ends_at.isoformat(),
        days_remaining=SubscriptionService._days_remaining(ends_at),
    )


@router.post("/create-subscription", response_model=CreateSubscriptionResponse)
async def create_subscription(
    request: CreateSubscriptionRequest,
    current_user: User = Depends(get_current_user),
):
    """Create a new Razorpay subscription for the user. Returns subscription ID for checkout."""
    if current_user.is_admin:
        raise HTTPException(status_code=400, detail="Admin users do not need subscriptions")

    if request.plan_type not in ("monthly", "annual"):
        raise HTTPException(status_code=400, detail="plan_type must be 'monthly' or 'annual'")

    # Redis lock: prevents concurrent creation from multiple tabs/clicks
    lock_key = f"billing:create_lock:{current_user.id}"
    redis_available = bool(redis_manager.async_redis_client)
    lock_acquired = True  # Default: proceed (if Redis is down, reuse logic still prevents duplicates)
    if redis_available:
        try:
            result = await redis_manager.async_redis_client.set(lock_key, "1", ex=30, nx=True)
            lock_acquired = bool(result)  # Redis SET NX returns True on success, None on contention
        except Exception:
            pass  # Redis error — proceed without lock
    if not lock_acquired:
        raise HTTPException(status_code=429, detail="Subscription creation already in progress. Please wait.")

    try:
        existing = await SubscriptionService.get_subscription(current_user.id)

        # Already active — block
        if existing and existing.status in ("active", "authenticated"):
            raise HTTPException(status_code=409, detail="User already has an active subscription")

        # Reuse existing 'created' subscription if still valid at Razorpay AND same plan
        if existing and existing.status == "created" and existing.razorpay_subscription_id and existing.plan_type == request.plan_type:
            try:
                rz_sub = await RazorpayService.fetch_subscription(existing.razorpay_subscription_id)
                if rz_sub.get("status") == "created":
                    logger.info(f"Reusing created subscription {existing.razorpay_subscription_id}")
                    return CreateSubscriptionResponse(
                        razorpay_subscription_id=existing.razorpay_subscription_id,
                        razorpay_plan_id=existing.razorpay_plan_id,
                        checkout_key=RazorpayService.get_checkout_key(),
                        plan_type=existing.plan_type,
                    )
                logger.info(f"Existing sub {existing.razorpay_subscription_id} status={rz_sub.get('status')}, creating new")
            except RazorpayError:
                logger.warning(f"Failed to fetch sub {existing.razorpay_subscription_id}, creating new")

        # If user has an active trial, defer subscription start to trial end
        start_at_ts = None
        if current_user.trial_ends_at:
            ends = SubscriptionService._ensure_utc(current_user.trial_ends_at)
            if datetime.now(timezone.utc) < ends:
                start_at_ts = int(ends.timestamp())

        # Create new Razorpay subscription
        try:
            rz_sub = await RazorpayService.create_subscription(
                plan_type=request.plan_type,
                user_phone=current_user.phone,
                user_name=current_user.name,
                start_at=start_at_ts,
            )
        except RazorpayError as e:
            logger.error(f"Razorpay create_subscription failed for user {current_user.id}: {e}")
            raise HTTPException(status_code=502, detail="Payment service unavailable")

        await SubscriptionService.create_or_update_subscription(
            user_id=current_user.id,
            razorpay_subscription_id=rz_sub["id"],
            razorpay_plan_id=rz_sub["plan_id"],
            plan_type=request.plan_type,
            status="created",
        )

        return CreateSubscriptionResponse(
            razorpay_subscription_id=rz_sub["id"],
            razorpay_plan_id=rz_sub["plan_id"],
            checkout_key=RazorpayService.get_checkout_key(),
            plan_type=request.plan_type,
        )
    finally:
        try:
            if redis_manager.async_redis_client:
                await redis_manager.async_redis_client.delete(lock_key)
        except Exception:
            pass


@router.post("/verify-payment", response_model=MessageResponse)
async def verify_payment(
    request: VerifyPaymentRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Verify Razorpay payment signature after checkout success.
    Updates subscription status to 'authenticated' immediately,
    instead of waiting for webhook delivery.
    """
    # Verify signature
    try:
        valid = RazorpayService.verify_payment_signature(
            razorpay_payment_id=request.razorpay_payment_id,
            razorpay_subscription_id=request.razorpay_subscription_id,
            razorpay_signature=request.razorpay_signature,
        )
    except RazorpayError as e:
        logger.error(f"Payment verification config error: {e}")
        raise HTTPException(status_code=500, detail="Payment verification unavailable")

    if not valid:
        logger.warning(
            f"Payment signature mismatch for user {current_user.id}, "
            f"sub={request.razorpay_subscription_id}"
        )
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    # Signature valid — update subscription to authenticated
    sub = await SubscriptionService.get_subscription(current_user.id)
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription found")

    if sub.razorpay_subscription_id != request.razorpay_subscription_id:
        raise HTTPException(status_code=400, detail="Subscription ID mismatch")

    # Reject verification for subs that are no longer viable
    if sub.status in ("cancelled", "halted", "completed"):
        logger.warning(f"Verify-payment for stale sub {request.razorpay_subscription_id}, status={sub.status}")
        raise HTTPException(status_code=409, detail="This subscription is no longer active. Please try again.")

    # Only upgrade status if still in 'created' state (webhook may have arrived first)
    if sub.status == "created":
        await SubscriptionService._update_sub_status(sub, "authenticated")
        logger.info(
            f"Payment verified for user {current_user.id}: "
            f"sub={request.razorpay_subscription_id} → authenticated"
        )

    # Finalize onboarding if user subscribed during preview (exitToPaywall path)
    if not current_user.onboarding_complete:
        try:
            from app.services.onboarding_service import OnboardingService
            await OnboardingService.mark_complete(current_user.id)
            logger.info(f"Onboarding completed via payment for user {current_user.id}")
        except Exception as e:
            logger.error(f"Failed to mark onboarding complete for user {current_user.id}: {e}")

    return MessageResponse(message="Payment verified")


@router.post("/cancel", response_model=MessageResponse)
async def cancel_subscription(
    request: CancelSubscriptionRequest,
    current_user: User = Depends(get_current_user),
):
    """Cancel the user's active subscription."""
    sub = await SubscriptionService.get_subscription(current_user.id)
    if not sub or not sub.razorpay_subscription_id:
        raise HTTPException(status_code=404, detail="No active subscription found")

    if sub.status not in ACTIVE_STATUSES:
        raise HTTPException(status_code=400, detail=f"Cannot cancel subscription in '{sub.status}' state")

    try:
        await RazorpayService.cancel_subscription(
            sub.razorpay_subscription_id,
            cancel_at_cycle_end=request.cancel_at_cycle_end,
        )
    except RazorpayError as e:
        logger.error(f"Razorpay cancel failed for user {current_user.id}: {e}")
        raise HTTPException(status_code=502, detail="Payment service unavailable")

    if not request.cancel_at_cycle_end:
        # Clear current_period_end so access is revoked immediately
        # (and so _on_cancelled webhook guard recognizes this as an immediate cancel)
        await SubscriptionService._update_sub_status(sub, "cancelled", {
            "current_period_end": None,
        })

    return MessageResponse(message="Subscription cancellation requested")


@router.post("/webhook")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: Optional[str] = Header(None, alias="X-Razorpay-Signature"),
    x_razorpay_event_id: Optional[str] = Header(None, alias="X-Razorpay-Event-Id"),
):
    """
    Razorpay webhook receiver. No auth, HMAC-verified.
    Must return 200 quickly.
    """
    body = await request.body()

    if not x_razorpay_signature:
        logger.warning("Webhook received without signature header")
        raise HTTPException(status_code=400, detail="Missing signature")

    if not RazorpayService.verify_webhook_signature(body, x_razorpay_signature):
        logger.warning("Webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = payload.get("event")
    razorpay_event_id = x_razorpay_event_id or None

    if not event_type:
        raise HTTPException(status_code=400, detail="Missing event type")

    logger.info(f"Razorpay webhook received: {event_type} (id={razorpay_event_id})")

    try:
        await SubscriptionService.handle_webhook_event(event_type, payload, razorpay_event_id)
    except SubscriptionNotFoundError:
        # Unknown sub — return 500 so Razorpay retries (race with DB write)
        raise HTTPException(status_code=500, detail="Unknown subscription")
    except Exception as e:
        logger.error(f"Webhook processing error for event {event_type}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Processing error")

    return {"status": "ok"}
