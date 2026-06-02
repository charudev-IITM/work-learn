"""
Onboarding API endpoints.
All endpoints require authentication (JWT) but NOT subscription.
The catalog endpoint soft-gates rate data behind access checks (strips
buy/sell rates for expired-preview and unsubscribed users).
"""

import logging
from fastapi import APIRouter, Depends, HTTPException

from app.database.models import User
from app.api.auth import get_current_user, is_access_allowed
from app.services.onboarding_service import OnboardingService
from app.schemas.onboarding import (
    OnboardingStateUpdate,
    OnboardingStateResponse,
    OnboardingEventCreate,
    CatalogResponse,
    CreateWatchlistRequest,
    CreateWatchlistResponse,
    PreviewTimerStatusResponse,
    WatchlistSuggestionsResponse,
)
from app.services.preview_timer_service import PreviewTimerService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


# ── State Management ─────────────────────────────────────────────────────────

@router.get("/state", response_model=OnboardingStateResponse)
async def get_onboarding_state(current_user: User = Depends(get_current_user)):
    """Get current onboarding state for resume."""
    return await OnboardingService.get_state(current_user.id)


@router.put("/state", response_model=OnboardingStateResponse)
async def update_onboarding_state(
    body: OnboardingStateUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update onboarding state (called on every step transition)."""
    return await OnboardingService.upsert_state(
        user_id=current_user.id,
        step=body.step,
        commodities=body.commodities,
        dealer_ids=body.dealer_ids,
    )


# ── Analytics ────────────────────────────────────────────────────────────────

@router.post("/event")
async def record_onboarding_event(
    body: OnboardingEventCreate,
    current_user: User = Depends(get_current_user),
):
    """Record an analytics event (step entered, completed, skipped)."""
    await OnboardingService.record_event(
        user_id=current_user.id,
        step=body.step,
        event_type=body.event_type,
        metadata=body.metadata,
    )
    return {"ok": True}


# ── Rate Catalog ─────────────────────────────────────────────────────────────

@router.get("/catalog", response_model=CatalogResponse)
async def get_catalog(
    commodities: str = None,
    purity: str = None,
    weight: str = None,
    current_user: User = Depends(get_current_user),
):
    """
    Get all dealers + scripts grouped by commodity.
    Optional query params: ?commodities=gold,silver&purity=999,995&weight=1g,10g

    Rate data (buy/sell) is only included when the user is in active preview
    or has a subscription. Expired-preview users get the catalog structure
    (dealer names, script names) but no prices.
    """
    include_rates = await is_access_allowed(
        current_user.id, current_user.is_admin, current_user.onboarding_complete
    )

    commodity_filter = None
    if commodities:
        commodity_filter = [c.strip() for c in commodities.split(",") if c.strip()]

    purity_filter = None
    if purity:
        purity_filter = [p.strip() for p in purity.split(",") if p.strip()]

    weight_filter = None
    if weight:
        weight_filter = [w.strip() for w in weight.split(",") if w.strip()]

    return await OnboardingService.build_rate_catalog(
        include_rates, commodity_filter, purity_filter, weight_filter
    )


# ── Auto-Watchlist Creation ──────────────────────────────────────────────────

@router.post("/create-watchlist", response_model=CreateWatchlistResponse)
async def create_onboarding_watchlist(
    body: CreateWatchlistRequest,
    current_user: User = Depends(get_current_user),
):
    """Create auto-populated watchlist from onboarding selections."""
    include_rates = await is_access_allowed(
        current_user.id, current_user.is_admin, current_user.onboarding_complete
    )

    try:
        return await OnboardingService.create_onboarding_watchlist(
            user_id=current_user.id,
            commodities=body.commodities,
            dealer_ids=body.dealer_ids,
            include_rates=include_rates,
        )
    except Exception as e:
        logger.error(f"Failed to create onboarding watchlist: {e}")
        raise HTTPException(status_code=500, detail="Failed to create watchlist")


# ── Watchlist Suggestions ────────────────────────────────────────────────

@router.get("/watchlist-suggestions", response_model=WatchlistSuggestionsResponse)
async def get_watchlist_suggestions(
    watchlist_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get suggestion cards for a watchlist (similar dealers, different products)."""
    include_rates = await is_access_allowed(
        current_user.id, current_user.is_admin, current_user.onboarding_complete
    )

    try:
        response = await OnboardingService.generate_watchlist_suggestions(
            watchlist_id=watchlist_id,
            user_id=current_user.id,
        )
        # Strip rates if not authorized
        if not include_rates:
            for s in response.suggestions:
                s.buy_rate = None
                s.sell_rate = None
        return response
    except Exception as e:
        logger.warning(f"Failed to generate watchlist suggestions: {e}")
        return WatchlistSuggestionsResponse()


# ── Preview Timer ────────────────────────────────────────────────────────────

@router.post("/preview/start", response_model=PreviewTimerStatusResponse)
async def start_preview_timer(current_user: User = Depends(get_current_user)):
    """Start the preview timer. Idempotent."""
    status = await PreviewTimerService.start(current_user.id)
    return status.to_dict()


@router.post("/preview/pause", response_model=PreviewTimerStatusResponse)
async def pause_preview_timer(current_user: User = Depends(get_current_user)):
    """Pause the preview timer."""
    status = await PreviewTimerService.pause(current_user.id)
    return status.to_dict()


@router.post("/preview/resume", response_model=PreviewTimerStatusResponse)
async def resume_preview_timer(current_user: User = Depends(get_current_user)):
    """Resume the preview timer."""
    status = await PreviewTimerService.resume(current_user.id)
    return status.to_dict()


@router.get("/preview/status", response_model=PreviewTimerStatusResponse)
async def get_preview_timer_status(current_user: User = Depends(get_current_user)):
    """Get current preview timer status."""
    status = await PreviewTimerService.get_status(current_user.id)
    return status.to_dict()


# ── Complete Onboarding ──────────────────────────────────────────────────────

@router.post("/complete")
async def complete_onboarding(current_user: User = Depends(get_current_user)):
    """Mark onboarding as complete and clean up state."""
    await OnboardingService.mark_complete(current_user.id)
    await OnboardingService.record_event(current_user.id, "done", "completed")
    return {"ok": True}
