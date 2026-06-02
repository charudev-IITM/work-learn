"""
Admin API endpoints — user management, platform overview, dealer requests,
subscription analytics, audit log, and broadcast.
"""

import logging
import json
import csv
import io
from datetime import datetime, timedelta
from typing import Optional, List, Any, Dict, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, or_, func, text

from app.database.connection import AsyncSessionLocal, redis_manager
from app.database.models import User, Subscription, DealerRequest
from app.services.subscription_service import SubscriptionService
from app.services.auth import _invalidate_user_cache
from app.services.session_service import SessionService
from app.services.websocket_manager import websocket_manager
from app.constants import ADMIN_BROADCAST_CHANNEL
from .auth import get_current_admin_user, _normalize_phone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

DEFAULT_DURATIONS = {"annual": 365, "monthly": 30}
PLATFORM_SETTING_KEYS = {"trial_promo_start", "trial_promo_end", "trial_duration_days", "preview_enabled"}

# Subscription statuses considered "active" for admin counts/analytics.
# Intentionally excludes "pending" (from SubscriptionService.ACTIVE_STATUSES) —
# pending means checkout started but not yet paid, so it shouldn't count toward active subs or MRR.
ADMIN_ACTIVE_STATUSES = ["active", "authenticated"]


# -- Pydantic Schemas --

class AdminSubscriptionInfo(BaseModel):
    id: str
    status: str
    plan_type: Optional[str]
    razorpay_subscription_id: Optional[str]
    current_period_start: Optional[str]
    current_period_end: Optional[str]

class AdminUserResponse(BaseModel):
    id: str
    phone: Optional[str]
    name: Optional[str]
    business: Optional[str] = None
    is_admin: bool
    is_active: bool
    onboarding_complete: bool
    created_at: Optional[str]
    last_login: Optional[str]
    ban_reason: Optional[str]
    banned_at: Optional[str]
    subscription: Optional[AdminSubscriptionInfo]
    abuse_score: Optional[float] = None
    trial_status: Optional[str] = None
    trial_days_left: Optional[int] = None
    is_online: bool = False

class PaginatedUsersResponse(BaseModel):
    users: List[AdminUserResponse]
    total: int
    has_more: bool

class GrantSubscriptionRequest(BaseModel):
    plan_type: Literal["annual", "monthly"] = "annual"
    duration_days: Optional[int] = Field(None, ge=1, le=3650)

class BanUserRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)

class AdminOverviewResponse(BaseModel):
    total_users: int
    active_subscriptions: int
    online_users: int
    total_scrapers: int
    pending_dealer_requests: int

class AdminSessionInfo(BaseModel):
    id: str
    device_hint: Optional[str]
    ip_address: Optional[str]
    created_at: Optional[str]
    revoked_at: Optional[str]
    revoke_reason: Optional[str]

class AdminWatchlistInfo(BaseModel):
    id: str
    name: str
    script_count: int

class AdminAlertInfo(BaseModel):
    id: str
    dealer_name: str
    script_name: str
    condition: str
    rate_type: str
    threshold: float
    is_active: bool

class AdminAbuseEvent(BaseModel):
    id: str
    signal: str
    score_delta: int
    total_score: int
    client_ip: Optional[str]
    occurred_at: Optional[str]

class AdminUserDetailResponse(BaseModel):
    user: AdminUserResponse
    trial_started_at: Optional[str] = None
    trial_ends_at: Optional[str] = None
    sessions: List[AdminSessionInfo]
    watchlists: List[AdminWatchlistInfo]
    alerts: List[AdminAlertInfo]
    abuse_score: Optional[float]
    abuse_events: List[AdminAbuseEvent]

class AdminDealerRequestResponse(BaseModel):
    id: str
    dealer_name: str
    dealer_url: str
    notes: Optional[str]
    user_name: Optional[str]
    user_phone: Optional[str]
    created_at: Optional[str]


class JourneyStatsResponse(BaseModel):
    signed_up: int
    onboarded: int
    trial_claimed: int
    subscribed: int
    trial_active: int
    online_now: int


class OnlineHistoryPoint(BaseModel):
    t: int   # unix timestamp (seconds)
    v: int   # online user count


class OnlineHistoryResponse(BaseModel):
    points: List[OnlineHistoryPoint]
    range: str


# -- Helpers --

IST_OFFSET = timedelta(hours=5, minutes=30)


def _format_ist(dt: Optional[datetime]) -> str:
    if not dt:
        return ""
    ist = dt.replace(tzinfo=None) + IST_OFFSET
    return ist.strftime("%d %b %Y, %I:%M %p")


def _compute_trial_status(user) -> tuple:
    if user.trial_started_at is None:
        return "not_claimed", None
    ends = user.trial_ends_at
    if ends and ends.replace(tzinfo=None) > datetime.utcnow():
        return "active", max(0, (ends.replace(tzinfo=None) - datetime.utcnow()).days)
    return "expired", None

def _user_to_response(
    user: User,
    sub: Optional[Subscription] = None,
    abuse_score: Optional[float] = None,
    online_user_ids: Optional[set] = None,
) -> AdminUserResponse:
    sub_info = None
    if sub:
        sub_info = AdminSubscriptionInfo(
            id=sub.id,
            status=sub.status,
            plan_type=sub.plan_type,
            razorpay_subscription_id=sub.razorpay_subscription_id,
            current_period_start=sub.current_period_start.isoformat() if sub.current_period_start else None,
            current_period_end=sub.current_period_end.isoformat() if sub.current_period_end else None,
        )
    trial_status, trial_days_left = _compute_trial_status(user)
    return AdminUserResponse(
        id=user.id,
        phone=user.phone,
        name=user.name,
        business=user.business,
        is_admin=user.is_admin,
        is_active=user.is_active if user.is_active is not None else True,
        onboarding_complete=user.onboarding_complete,
        created_at=user.created_at.isoformat() if user.created_at else None,
        last_login=user.last_login.isoformat() if user.last_login else None,
        ban_reason=user.ban_reason,
        banned_at=user.banned_at.isoformat() if user.banned_at else None,
        subscription=sub_info,
        abuse_score=abuse_score,
        trial_status=trial_status,
        trial_days_left=trial_days_left,
        is_online=user.id in online_user_ids if online_user_ids else False,
    )


async def _get_online_user_ids() -> set:
    """Fetch the set of currently online user IDs from Redis."""
    try:
        members = await redis_manager.async_redis_client.smembers("ws:online_users")
        return {m.decode() if isinstance(m, bytes) else str(m) for m in members}
    except Exception:
        return set()


async def _fetch_user_and_sub(user_id: str) -> tuple[User, Optional[Subscription]]:
    """Fetch a user + subscription pair, raising 404 if not found."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User, Subscription)
            .outerjoin(Subscription, User.id == Subscription.user_id)
            .where(User.id == user_id)
        )
        row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return row


async def _cancel_razorpay_if_needed(razorpay_sub_id: Optional[str]) -> None:
    """Best-effort cancel on Razorpay. Logs warning on failure."""
    if not razorpay_sub_id:
        return
    try:
        from app.services.razorpay_service import RazorpayService
        await RazorpayService.cancel_subscription(razorpay_sub_id, cancel_at_cycle_end=False)
        logger.info(f"Cancelled Razorpay subscription {razorpay_sub_id}")
    except Exception as e:
        logger.warning(f"Failed to cancel Razorpay subscription {razorpay_sub_id}: {e}")


async def _log_admin_action(
    admin_user_id: str,
    action: str,
    target_user_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """Log an admin action to the audit table. Best-effort — never raises."""
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                text("""
                    INSERT INTO admin_audit_log (id, admin_user_id, action, target_user_id, details, created_at)
                    VALUES (gen_random_uuid()::text, :admin_user_id, :action, :target_user_id, :details, NOW())
                """),
                {
                    "admin_user_id": admin_user_id,
                    "action": action,
                    "target_user_id": target_user_id,
                    "details": json.dumps(details) if details else None,
                },
            )
            await session.commit()
    except Exception as e:
        logger.warning(f"Failed to log admin action '{action}': {e}")


# -- New Pydantic Schemas --

class SubscriptionAnalyticsResponse(BaseModel):
    total_active: int
    total_cancelled: int
    total_created: int
    by_plan: Dict[str, int]
    mrr_estimate: float
    recent_events: List[Dict[str, Any]]
    new_last_7d: int
    new_last_30d: int
    cancelled_last_7d: int
    cancelled_last_30d: int

class AuditLogEntryResponse(BaseModel):
    id: str
    admin_name: Optional[str]
    admin_phone: Optional[str]
    action: str
    target_user_name: Optional[str]
    target_user_phone: Optional[str]
    details: Optional[Dict[str, Any]]
    created_at: str

class PaginatedAuditLogResponse(BaseModel):
    entries: List[AuditLogEntryResponse]
    total: int
    has_more: bool

class BroadcastRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)
    type: Literal["info", "warning", "maintenance"] = "info"


# -- Endpoints --

@router.get("/overview", response_model=AdminOverviewResponse)
async def get_overview(
    _admin: User = Depends(get_current_admin_user),
):
    """Platform stats for admin dashboard."""
    from scrapers import SCRAPERS

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("""
                SELECT
                    (SELECT COUNT(*) FROM users) AS total_users,
                    (SELECT COUNT(*) FROM subscriptions WHERE status = ANY(:active_statuses)) AS active_subscriptions,
                    (SELECT COUNT(*) FROM dealer_requests) AS pending_dealer_requests
            """),
            {"active_statuses": ADMIN_ACTIVE_STATUSES},
        )
        row = result.one()

    online_users = await websocket_manager.global_online_count()

    return AdminOverviewResponse(
        total_users=row.total_users or 0,
        active_subscriptions=row.active_subscriptions or 0,
        online_users=online_users,
        total_scrapers=len(SCRAPERS),
        pending_dealer_requests=row.pending_dealer_requests or 0,
    )


DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100


@router.get("/users", response_model=PaginatedUsersResponse)
async def list_users(
    search: Optional[str] = None,
    filter: Optional[str] = None,
    limit: int = DEFAULT_PAGE_SIZE,
    offset: int = 0,
    _admin: User = Depends(get_current_admin_user),
):
    """List users with pagination. Optional search by phone/name, filter=abuse."""
    limit = min(max(limit, 1), MAX_PAGE_SIZE)
    offset = max(offset, 0)

    if filter == "abuse":
        return await _list_abuse_users(limit, offset)

    async with AsyncSessionLocal() as session:
        base = select(User, Subscription).outerjoin(
            Subscription, User.id == Subscription.user_id
        )

        if search:
            search = search.strip()
            try:
                normalized = _normalize_phone(search)
                base = base.where(
                    or_(
                        User.phone == normalized,
                        User.phone.contains(search),
                        User.name.ilike(f"%{search}%"),
                    )
                )
            except Exception:
                base = base.where(
                    or_(
                        User.phone.contains(search),
                        User.name.ilike(f"%{search}%"),
                    )
                )

        # Count total
        count_q = select(func.count()).select_from(base.subquery())
        total = (await session.execute(count_q)).scalar() or 0

        # Fetch page
        query = base.order_by(User.created_at.desc()).limit(limit).offset(offset)
        result = await session.execute(query)
        rows = result.all()

    # Fetch online user IDs once (single SMEMBERS call)
    online_user_ids = await _get_online_user_ids()

    users = [_user_to_response(user, sub, online_user_ids=online_user_ids) for user, sub in rows]
    return PaginatedUsersResponse(users=users, total=total, has_more=offset + limit < total)


async def _list_abuse_users(limit: int, offset: int) -> PaginatedUsersResponse:
    """Return users who have abuse events, enriched with Redis abuse scores."""
    async with AsyncSessionLocal() as session:
        # Count total abuse users
        count_result = await session.execute(
            text("SELECT COUNT(DISTINCT user_id) FROM abuse_events WHERE user_id IS NOT NULL")
        )
        total = count_result.scalar() or 0

        if total == 0:
            return PaginatedUsersResponse(users=[], total=0, has_more=False)

        # Get distinct abuse user IDs (paginated)
        result = await session.execute(
            text("""
                SELECT user_id, MAX(occurred_at) AS last_abuse_at
                FROM abuse_events
                WHERE user_id IS NOT NULL
                GROUP BY user_id
                ORDER BY last_abuse_at DESC
                LIMIT :limit OFFSET :offset
            """),
            {"limit": limit, "offset": offset},
        )
        abuse_rows = [(r.user_id, r.last_abuse_at) for r in result]

    if not abuse_rows:
        return PaginatedUsersResponse(users=[], total=total, has_more=False)

    # Fetch abuse scores from Redis in a pipeline
    scores: dict[str, float] = {}
    try:
        pipe = redis_manager.async_redis_client.pipeline()
        for uid, _ in abuse_rows:
            pipe.get(f"abuse:score:{uid}")
        raw_scores = await pipe.execute()
        for (uid, _), raw in zip(abuse_rows, raw_scores):
            if raw is not None:
                scores[uid] = float(raw)
    except Exception as e:
        logger.warning(f"Failed to fetch abuse scores from Redis: {e}")

    # Fetch full user + subscription rows
    user_ids = [uid for uid, _ in abuse_rows]
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User, Subscription)
            .outerjoin(Subscription, User.id == Subscription.user_id)
            .where(User.id.in_(user_ids))
        )
        rows = {user.id: (user, sub) for user, sub in result.all()}

    # Build response sorted by abuse score desc
    responses = []
    for uid, _ in abuse_rows:
        if uid in rows:
            user, sub = rows[uid]
            responses.append(_user_to_response(user, sub, abuse_score=scores.get(uid)))

    responses.sort(key=lambda r: r.abuse_score or 0, reverse=True)
    return PaginatedUsersResponse(users=responses, total=total, has_more=offset + limit < total)


# ── CSV Export ───────────────────────────────────────────────────────────────
# Must be before /users/{user_id} to avoid "export" matching as a user_id

EXPORT_COLUMNS = {
    "phone": "Phone",
    "name": "Name",
    "business": "Business",
    "joined": "Joined (IST)",
    "last_login": "Last Login (IST)",
    "onboarding": "Onboarded",
    "subscription_status": "Subscription",
    "subscription_plan": "Plan",
    "subscription_expiry": "Expiry (IST)",
    "trial_status": "Trial",
    "is_active": "Account Active",
    "is_online": "Online Now",
}

EXPORT_MAX_ROWS = 10000


@router.get("/users/export")
async def export_users(
    columns: str = Query(..., description="Comma-separated column keys"),
    search: Optional[str] = None,
    filter: Optional[str] = None,
    _admin: User = Depends(get_current_admin_user),
):
    """Export users as CSV. Respects the same search/filter as list_users."""
    requested_cols = [c.strip() for c in columns.split(",") if c.strip() in EXPORT_COLUMNS]
    if not requested_cols:
        raise HTTPException(status_code=400, detail="No valid columns specified")

    async with AsyncSessionLocal() as session:
        base = select(User, Subscription).outerjoin(
            Subscription, User.id == Subscription.user_id
        )

        if search:
            search = search.strip()
            try:
                normalized = _normalize_phone(search)
                base = base.where(
                    or_(
                        User.phone == normalized,
                        User.phone.contains(search),
                        User.name.ilike(f"%{search}%"),
                    )
                )
            except Exception:
                base = base.where(
                    or_(
                        User.phone.contains(search),
                        User.name.ilike(f"%{search}%"),
                    )
                )

        query = base.order_by(User.created_at.desc()).limit(EXPORT_MAX_ROWS)
        result = await session.execute(query)
        rows = result.all()

    # Fetch online set only if needed
    online_user_ids: set = set()
    if "is_online" in requested_cols:
        online_user_ids = await _get_online_user_ids()

    # Build CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([EXPORT_COLUMNS[c] for c in requested_cols])

    for user, sub in rows:
        trial_status, trial_days_left = _compute_trial_status(user)
        row_data: dict = {
            "phone": user.phone or "",
            "name": user.name or "",
            "business": user.business or "",
            "joined": _format_ist(user.created_at),
            "last_login": _format_ist(user.last_login),
            "onboarding": "Yes" if user.onboarding_complete else "No",
            "subscription_status": sub.status if sub else "None",
            "subscription_plan": sub.plan_type if sub else "",
            "subscription_expiry": _format_ist(sub.current_period_end) if sub else "",
            "trial_status": f"{trial_status} ({trial_days_left}d left)" if trial_status == "active" else trial_status,
            "is_active": "Yes" if (user.is_active if user.is_active is not None else True) else "No",
            "is_online": "Yes" if user.id in online_user_ids else "No",
        }
        writer.writerow([row_data[c] for c in requested_cols])

    csv_content = output.getvalue()
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="users_export_{timestamp}.csv"'},
    )


@router.get("/users/{user_id}", response_model=AdminUserResponse)
async def get_user(
    user_id: str,
    _admin: User = Depends(get_current_admin_user),
):
    """Get single user detail with subscription."""
    user, sub = await _fetch_user_and_sub(user_id)
    online_user_ids = await _get_online_user_ids()
    return _user_to_response(user, sub, online_user_ids=online_user_ids)


@router.get("/users/{user_id}/detail", response_model=AdminUserDetailResponse)
async def get_user_detail(
    user_id: str,
    _admin: User = Depends(get_current_admin_user),
):
    """Rich user detail: sessions, watchlists, alerts, abuse data."""
    async with AsyncSessionLocal() as session:
        # User + subscription
        result = await session.execute(
            select(User, Subscription)
            .outerjoin(Subscription, User.id == Subscription.user_id)
            .where(User.id == user_id)
        )
        row = result.first()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        user, sub = row

        # Sessions (last 10, raw SQL — no ORM model)
        sessions_result = await session.execute(
            text("""
                SELECT id, device_hint, ip_address, created_at, revoked_at, revoke_reason
                FROM user_sessions
                WHERE user_id = :user_id
                ORDER BY created_at DESC
                LIMIT 10
            """),
            {"user_id": user_id},
        )
        sessions = [
            AdminSessionInfo(
                id=str(r.id),
                device_hint=r.device_hint,
                ip_address=r.ip_address,
                created_at=r.created_at.isoformat() if r.created_at else None,
                revoked_at=r.revoked_at.isoformat() if r.revoked_at else None,
                revoke_reason=r.revoke_reason,
            )
            for r in sessions_result
        ]

        # Watchlists with script counts
        watchlists_result = await session.execute(
            text("""
                SELECT w.id, w.name, COUNT(ws.id) AS script_count
                FROM user_watchlists w
                LEFT JOIN user_watchlist_scripts ws ON ws.watchlist_id = w.id
                WHERE w.user_id = :user_id
                GROUP BY w.id, w.name
                ORDER BY w.order_index
            """),
            {"user_id": user_id},
        )
        watchlists = [
            AdminWatchlistInfo(id=str(r.id), name=r.name, script_count=r.script_count)
            for r in watchlists_result
        ]

        # Active alerts
        alerts_result = await session.execute(
            text("""
                SELECT id, dealer_name, script_name, condition, rate_type, threshold, is_active
                FROM price_alerts
                WHERE user_id = :user_id
                ORDER BY created_at DESC
            """),
            {"user_id": user_id},
        )
        alerts = [
            AdminAlertInfo(
                id=str(r.id),
                dealer_name=r.dealer_name,
                script_name=r.script_name,
                condition=r.condition,
                rate_type=r.rate_type,
                threshold=r.threshold,
                is_active=r.is_active,
            )
            for r in alerts_result
        ]

        # Abuse events (last 20, raw SQL)
        abuse_events = []
        try:
            abuse_result = await session.execute(
                text("""
                    SELECT id, signal, score_delta, total_score, client_ip, occurred_at
                    FROM abuse_events
                    WHERE user_id = :user_id
                    ORDER BY occurred_at DESC
                    LIMIT 20
                """),
                {"user_id": user_id},
            )
            abuse_events = [
                AdminAbuseEvent(
                    id=str(r.id),
                    signal=r.signal,
                    score_delta=r.score_delta,
                    total_score=r.total_score,
                    client_ip=r.client_ip,
                    occurred_at=r.occurred_at.isoformat() if r.occurred_at else None,
                )
                for r in abuse_result
            ]
        except Exception as e:
            logger.warning(f"Failed to fetch abuse events for {user_id}: {e}")

    # Abuse score from Redis
    abuse_score = None
    try:
        score_str = await redis_manager.get(f"abuse:score:{user_id}")
        if score_str:
            abuse_score = float(score_str)
    except Exception:
        pass

    online_user_ids = await _get_online_user_ids()

    return AdminUserDetailResponse(
        user=_user_to_response(user, sub, online_user_ids=online_user_ids),
        trial_started_at=user.trial_started_at.isoformat() if user.trial_started_at else None,
        trial_ends_at=user.trial_ends_at.isoformat() if user.trial_ends_at else None,
        sessions=sessions,
        watchlists=watchlists,
        alerts=alerts,
        abuse_score=abuse_score,
        abuse_events=abuse_events,
    )


@router.post("/users/{user_id}/ban", response_model=AdminUserResponse)
async def ban_user(
    user_id: str,
    body: BanUserRequest,
    _admin: User = Depends(get_current_admin_user),
):
    """Ban a user — deactivates account, invalidates sessions, sends force_logout."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User, Subscription)
            .outerjoin(Subscription, User.id == Subscription.user_id)
            .where(User.id == user_id)
        )
        row = result.first()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        user, sub = row

        if user.is_admin:
            raise HTTPException(status_code=403, detail="Cannot ban admin users")

        if not user.is_active:
            raise HTTPException(status_code=400, detail="User is already banned")

        user.is_active = False
        user.ban_reason = body.reason
        user.banned_at = datetime.utcnow()
        user.updated_at = datetime.utcnow()

        await session.commit()
        await session.refresh(user)
        if sub:
            await session.refresh(sub)

    # Invalidate caches and sessions
    await _invalidate_user_cache(user_id)
    await SubscriptionService.invalidate_cache(user_id)
    await SessionService.invalidate_all_sessions(user_id, "admin_ban")

    # Notify via WebSocket, then close connections
    await websocket_manager.send_to_user(
        user_id,
        {"type": "force_logout", "reason": "Your account has been suspended."},
    )
    await websocket_manager.close_user_connections(user_id)

    await _log_admin_action(_admin.id, "ban", user_id, {"reason": body.reason})
    logger.info(f"Admin banned user {user_id}: {body.reason}")
    return _user_to_response(user, sub)


@router.post("/users/{user_id}/unban", response_model=AdminUserResponse)
async def unban_user(
    user_id: str,
    _admin: User = Depends(get_current_admin_user),
):
    """Unban a user — reactivates account."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User, Subscription)
            .outerjoin(Subscription, User.id == Subscription.user_id)
            .where(User.id == user_id)
        )
        row = result.first()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        user, sub = row

        if user.is_active:
            raise HTTPException(status_code=400, detail="User is not banned")

        user.is_active = True
        user.ban_reason = None
        user.banned_at = None
        user.updated_at = datetime.utcnow()

        await session.commit()
        await session.refresh(user)
        if sub:
            await session.refresh(sub)

    await _invalidate_user_cache(user_id)

    await _log_admin_action(_admin.id, "unban", user_id)
    logger.info(f"Admin unbanned user {user_id}")
    return _user_to_response(user, sub)


@router.post("/users/{user_id}/force-logout", response_model=AdminUserResponse)
async def force_logout(
    user_id: str,
    _admin: User = Depends(get_current_admin_user),
):
    """Force logout a user without banning them."""
    user, sub = await _fetch_user_and_sub(user_id)

    await SessionService.invalidate_all_sessions(user_id, "admin_force_logout")
    await websocket_manager.send_to_user(
        user_id,
        {"type": "force_logout", "reason": "You have been signed out by an administrator."},
    )
    await websocket_manager.close_user_connections(user_id)

    await _log_admin_action(_admin.id, "force_logout", user_id)
    logger.info(f"Admin force-logged-out user {user_id}")
    return _user_to_response(user, sub)


@router.post("/users/{user_id}/subscription", response_model=AdminUserResponse)
async def grant_subscription(
    user_id: str,
    body: GrantSubscriptionRequest,
    _admin: User = Depends(get_current_admin_user),
):
    """Grant a manual subscription to a user."""
    duration = body.duration_days or DEFAULT_DURATIONS[body.plan_type]
    now = datetime.utcnow()

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User, Subscription)
            .outerjoin(Subscription, User.id == Subscription.user_id)
            .where(User.id == user_id)
        )
        row = result.first()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        user, sub = row

        razorpay_id_to_cancel = None

        if sub:
            # If there's a Razorpay sub, clear it from DB first (commit), then cancel on Razorpay
            razorpay_id_to_cancel = sub.razorpay_subscription_id
            sub.razorpay_subscription_id = None
            sub.razorpay_plan_id = None
            sub.razorpay_customer_id = None
            sub.status = "active"
            sub.plan_type = body.plan_type
            sub.current_period_start = now
            sub.current_period_end = now + timedelta(days=duration)
            sub.updated_at = now
        else:
            sub = Subscription(
                user_id=user_id,
                plan_type=body.plan_type,
                status="active",
                current_period_start=now,
                current_period_end=now + timedelta(days=duration),
            )
            session.add(sub)

        await session.commit()
        await session.refresh(sub)
        await session.refresh(user)

    # Cancel Razorpay after DB commit (prevents webhook race)
    await _cancel_razorpay_if_needed(razorpay_id_to_cancel)

    # Invalidate cache
    await SubscriptionService.invalidate_cache(user_id)

    await _log_admin_action(_admin.id, "grant_sub", user_id, {"plan_type": body.plan_type, "duration_days": duration})
    return _user_to_response(user, sub)


@router.delete("/users/{user_id}/subscription", response_model=AdminUserResponse)
async def revoke_subscription(
    user_id: str,
    _admin: User = Depends(get_current_admin_user),
):
    """Revoke a user's subscription."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User, Subscription)
            .outerjoin(Subscription, User.id == Subscription.user_id)
            .where(User.id == user_id)
        )
        row = result.first()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        user, sub = row
        if not sub:
            raise HTTPException(status_code=404, detail="No subscription found")

        razorpay_id_to_cancel = sub.razorpay_subscription_id
        sub.razorpay_subscription_id = None
        sub.razorpay_plan_id = None
        sub.razorpay_customer_id = None
        sub.status = "cancelled"
        sub.current_period_start = None
        sub.current_period_end = None
        sub.updated_at = datetime.utcnow()

        await session.commit()
        await session.refresh(sub)
        await session.refresh(user)

    await _cancel_razorpay_if_needed(razorpay_id_to_cancel)
    await SubscriptionService.invalidate_cache(user_id)

    await _log_admin_action(_admin.id, "revoke_sub", user_id)
    return _user_to_response(user, sub)


@router.get("/dealer-requests", response_model=List[AdminDealerRequestResponse])
async def list_dealer_requests(
    _admin: User = Depends(get_current_admin_user),
):
    """List all dealer requests with user info."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(DealerRequest, User.name, User.phone)
            .join(User, DealerRequest.user_id == User.id)
            .order_by(DealerRequest.created_at.desc())
        )
        rows = result.all()

    return [
        AdminDealerRequestResponse(
            id=str(dr.id),
            dealer_name=dr.dealer_name,
            dealer_url=dr.dealer_url,
            notes=dr.notes,
            user_name=user_name,
            user_phone=user_phone,
            created_at=dr.created_at.isoformat() if dr.created_at else None,
        )
        for dr, user_name, user_phone in rows
    ]


@router.delete("/dealer-requests/{request_id}", status_code=204)
async def dismiss_dealer_request(
    request_id: str,
    _admin: User = Depends(get_current_admin_user),
):
    """Dismiss (delete) a dealer request."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(DealerRequest).where(DealerRequest.id == request_id)
        )
        dr = result.scalar_one_or_none()
        if not dr:
            raise HTTPException(status_code=404, detail="Dealer request not found")

        dealer_name = dr.dealer_name
        await session.delete(dr)
        await session.commit()

    await _log_admin_action(_admin.id, "dismiss_request", details={"dealer_name": dealer_name, "request_id": request_id})
    return Response(status_code=204)


# ── Subscription Analytics ────────────────────────────────────────────────────

PLAN_MONTHLY_PRICE = 999
PLAN_ANNUAL_PRICE = 9999

@router.get("/subscriptions/analytics", response_model=SubscriptionAnalyticsResponse)
async def get_subscription_analytics(
    _admin: User = Depends(get_current_admin_user),
):
    """Subscription analytics: counts, MRR estimate, recent events."""
    now = datetime.utcnow()
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    async with AsyncSessionLocal() as session:
        # Single query with FILTER for all counts — avoids 7 round-trips
        # Uses = ANY(:param) instead of IN :param for asyncpg compatibility
        # Single query: all counts + by-plan breakdown
        counts_result = await session.execute(
            text("""
                SELECT
                    COUNT(*) FILTER (WHERE status = ANY(:active_statuses)) AS total_active,
                    COUNT(*) FILTER (WHERE status = 'cancelled') AS total_cancelled,
                    COUNT(*) FILTER (WHERE status = 'created') AS total_created,
                    COUNT(*) FILTER (WHERE status = ANY(:active_statuses) AND created_at >= :seven_days_ago) AS new_last_7d,
                    COUNT(*) FILTER (WHERE status = ANY(:active_statuses) AND created_at >= :thirty_days_ago) AS new_last_30d,
                    COUNT(*) FILTER (WHERE status = 'cancelled' AND updated_at >= :seven_days_ago) AS cancelled_last_7d,
                    COUNT(*) FILTER (WHERE status = 'cancelled' AND updated_at >= :thirty_days_ago) AS cancelled_last_30d,
                    COUNT(*) FILTER (WHERE status = ANY(:active_statuses) AND plan_type = 'annual') AS active_annual,
                    COUNT(*) FILTER (WHERE status = ANY(:active_statuses) AND plan_type = 'monthly') AS active_monthly
                FROM subscriptions
            """),
            {"seven_days_ago": seven_days_ago, "thirty_days_ago": thirty_days_ago, "active_statuses": ADMIN_ACTIVE_STATUSES},
        )
        c = counts_result.one()
        total_active = c.total_active or 0
        total_cancelled = c.total_cancelled or 0
        total_created = c.total_created or 0
        new_last_7d = c.new_last_7d or 0
        new_last_30d = c.new_last_30d or 0
        cancelled_last_7d = c.cancelled_last_7d or 0
        cancelled_last_30d = c.cancelled_last_30d or 0

        annual_count = c.active_annual or 0
        monthly_count = c.active_monthly or 0
        by_plan: dict = {}
        if annual_count:
            by_plan["annual"] = annual_count
        if monthly_count:
            by_plan["monthly"] = monthly_count
        mrr_estimate = (annual_count * PLAN_ANNUAL_PRICE / 12) + (monthly_count * PLAN_MONTHLY_PRICE)

        # Recent events — join to subscriptions for plan_type (not on subscription_events)
        recent_events: list = []
        try:
            events_result = await session.execute(
                text("""
                    SELECT se.event_type, u.phone AS user_phone, s.plan_type, se.processed_at
                    FROM subscription_events se
                    LEFT JOIN users u ON se.user_id = u.id
                    LEFT JOIN subscriptions s ON se.subscription_id = s.id
                    ORDER BY se.processed_at DESC
                    LIMIT 50
                """)
            )
            recent_events = [
                {
                    "event_type": r.event_type,
                    "user_phone": r.user_phone,
                    "plan_type": r.plan_type,
                    "processed_at": r.processed_at.isoformat() if r.processed_at else None,
                }
                for r in events_result
            ]
        except Exception as e:
            logger.warning(f"Failed to fetch subscription events: {e}")

    return SubscriptionAnalyticsResponse(
        total_active=total_active,
        total_cancelled=total_cancelled,
        total_created=total_created,
        by_plan=by_plan,
        mrr_estimate=mrr_estimate,
        recent_events=recent_events,
        new_last_7d=new_last_7d,
        new_last_30d=new_last_30d,
        cancelled_last_7d=cancelled_last_7d,
        cancelled_last_30d=cancelled_last_30d,
    )


# ── Audit Log ─────────────────────────────────────────────────────────────────

@router.get("/audit-log", response_model=PaginatedAuditLogResponse)
async def get_audit_log(
    limit: int = DEFAULT_PAGE_SIZE,
    offset: int = 0,
    _admin: User = Depends(get_current_admin_user),
):
    """Paginated admin audit log."""
    limit = min(max(limit, 1), MAX_PAGE_SIZE)
    offset = max(offset, 0)

    async with AsyncSessionLocal() as session:
        # Single query with window function for total count
        result = await session.execute(
            text("""
                SELECT
                    a.id, a.action, a.details, a.created_at,
                    admin_u.name AS admin_name, admin_u.phone AS admin_phone,
                    target_u.name AS target_user_name, target_u.phone AS target_user_phone,
                    COUNT(*) OVER () AS total_count
                FROM admin_audit_log a
                LEFT JOIN users admin_u ON a.admin_user_id = admin_u.id
                LEFT JOIN users target_u ON a.target_user_id = target_u.id
                ORDER BY a.created_at DESC
                LIMIT :limit OFFSET :offset
            """),
            {"limit": limit, "offset": offset},
        )
        rows = result.all()

    total = rows[0].total_count if rows else 0
    entries = [
        AuditLogEntryResponse(
            id=str(r.id),
            admin_name=r.admin_name,
            admin_phone=r.admin_phone,
            action=r.action,
            target_user_name=r.target_user_name,
            target_user_phone=r.target_user_phone,
            details=r.details if r.details else None,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in rows
    ]

    return PaginatedAuditLogResponse(
        entries=entries,
        total=total,
        has_more=offset + limit < total,
    )


# ── Broadcast ─────────────────────────────────────────────────────────────────

@router.post("/broadcast", status_code=204)
async def broadcast_announcement(
    body: BroadcastRequest,
    _admin: User = Depends(get_current_admin_user),
):
    """Broadcast an announcement to all connected WebSocket users via Redis pub/sub."""
    payload = {
        "type": "announcement",
        "message": body.message,
        "announcement_type": body.type,
        "timestamp": datetime.utcnow().isoformat(),
    }
    # Publish to Redis so all backend pods receive and broadcast to their local WS connections
    try:
        await redis_manager.async_redis_client.publish(ADMIN_BROADCAST_CHANNEL, json.dumps(payload))
    except Exception as e:
        logger.warning(f"Redis publish failed, falling back to local broadcast: {e}")
        await websocket_manager.broadcast_json(payload)

    await _log_admin_action(
        _admin.id, "broadcast", details={"message": body.message, "announcement_type": body.type}
    )

    logger.info(f"Admin broadcast: [{body.type}] {body.message[:50]}")
    return Response(status_code=204)


# ── Journey Stats ────────────────────────────────────────────────────────────

@router.get("/journey-stats", response_model=JourneyStatsResponse)
async def get_journey_stats(
    since: Optional[str] = Query(None, regex="^(1d|7d|30d)$"),
    _admin: User = Depends(get_current_admin_user),
):
    """User journey funnel stats with optional time filter."""
    cutoff = None
    if since:
        days = {"1d": 1, "7d": 7, "30d": 30}[since]
        cutoff = datetime.utcnow() - timedelta(days=days)

    async with AsyncSessionLocal() as session:
        # Branch the query to avoid passing NULL to asyncpg (can't infer type)
        where_clause = "WHERE created_at >= :since" if cutoff else ""
        params: dict = {"active_statuses": ADMIN_ACTIVE_STATUSES}
        if cutoff:
            params["since"] = cutoff

        result = await session.execute(
            text(f"""
                SELECT
                    COUNT(*) AS signed_up,
                    COUNT(*) FILTER (WHERE onboarding_complete = true) AS onboarded,
                    COUNT(*) FILTER (WHERE trial_started_at IS NOT NULL) AS trial_claimed,
                    COUNT(*) FILTER (WHERE trial_ends_at > NOW()) AS trial_active,
                    (SELECT COUNT(*) FROM subscriptions WHERE status = ANY(:active_statuses)) AS subscribed
                FROM users
                {where_clause}
            """),
            params,
        )
        row = result.one()

    online_now = await websocket_manager.global_online_count()

    return JourneyStatsResponse(
        signed_up=row.signed_up or 0,
        onboarded=row.onboarded or 0,
        trial_claimed=row.trial_claimed or 0,
        subscribed=row.subscribed or 0,
        trial_active=row.trial_active or 0,
        online_now=online_now,
    )


@router.get("/online-history", response_model=OnlineHistoryResponse)
async def get_online_history(
    range: Literal["today", "7d"] = "today",
    _admin: User = Depends(get_current_admin_user),
):
    """Online user count time-series for the admin chart."""
    from app.services.online_history_service import get_samples
    range_seconds = 86400 if range == "today" else 604800
    raw = await get_samples(range_seconds)
    return OnlineHistoryResponse(
        points=[OnlineHistoryPoint(t=p["t"], v=p["v"]) for p in raw],
        range=range,
    )


# ── Rate Taxonomy ─────────────────────────────────────────────────────────────

@router.get("/rate-taxonomy")
async def get_rate_taxonomy(
    dealer_id: Optional[str] = None,
    commodity: Optional[str] = None,
    category: Optional[str] = None,
    _admin: User = Depends(get_current_admin_user),
):
    """Classify all live rate line items into structured taxonomy.

    Results are cached in Redis for 60s. Filters are applied post-cache.

    Optional filters:
      - dealer_id: Show only one dealer
      - commodity: Filter by commodity (Gold, Silver, etc.)
      - category: Filter by rate_category (dealer_rate, reference, premium)
    """
    from app.main import cached_rate_service
    from app.services.rate_taxonomy import get_cached_taxonomy

    current_rates = await cached_rate_service.get_current_rates()

    if dealer_id and dealer_id not in current_rates:
        raise HTTPException(status_code=404, detail=f"Dealer '{dealer_id}' not found")

    classified, summary = await get_cached_taxonomy(
        current_rates, dealer_id=dealer_id, commodity=commodity, category=category,
    )

    return {
        "summary": summary,
        "dealers": classified,
    }


# ── Platform Settings ────────────────────────────────────────────────────────

class PlatformSettingUpdate(BaseModel):
    value: str

class PlatformSettingsBatchUpdate(BaseModel):
    settings: Dict[str, str]


def _validate_setting(key: str, value: str) -> None:
    """Raise HTTPException if the value is invalid for the given setting key."""
    if key == "trial_duration_days":
        try:
            n = int(value)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="trial_duration_days must be an integer")
        if n < 1 or n > 365:
            raise HTTPException(status_code=400, detail="trial_duration_days must be between 1 and 365")

@router.get("/platform-settings")
async def get_platform_settings(
    _admin: User = Depends(get_current_admin_user),
):
    """Get all platform settings."""
    from app.services.platform_settings_service import PlatformSettingsService
    settings = await PlatformSettingsService.get_all()
    return {"settings": settings}


@router.put("/platform-settings/{key}")
async def update_platform_setting(
    key: str,
    body: PlatformSettingUpdate,
    admin: User = Depends(get_current_admin_user),
):
    """Update a platform setting."""
    from app.services.platform_settings_service import PlatformSettingsService

    if key not in PLATFORM_SETTING_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown setting: {key}")

    _validate_setting(key, body.value)
    await PlatformSettingsService.set(key, body.value)

    # Audit log
    await _log_admin_action(admin.id, "update_setting", details={"key": key, "value": body.value})

    return {"key": key, "value": body.value}


@router.put("/platform-settings")
async def batch_update_platform_settings(
    body: PlatformSettingsBatchUpdate,
    admin: User = Depends(get_current_admin_user),
):
    """Update multiple platform settings. Validates all before writing, but writes are sequential (not transactional)."""
    from app.services.platform_settings_service import PlatformSettingsService

    unknown = set(body.settings.keys()) - PLATFORM_SETTING_KEYS
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown settings: {', '.join(unknown)}")

    for key, value in body.settings.items():
        _validate_setting(key, value)

    for key, value in body.settings.items():
        await PlatformSettingsService.set(key, value)

    await _log_admin_action(admin.id, "update_settings_batch", details={"settings": body.settings})

    return {"updated": list(body.settings.keys())}
