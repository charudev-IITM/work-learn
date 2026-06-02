"""
Goldie AI Agent API endpoints.

POST /api/agent/chat    — SSE streaming chat (deducts 1 credit)
POST /api/agent/confirm — Execute a pending action (alert/watchlist)
GET  /api/agent/credits — Current credit balance
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.database.models import User
from app.schemas.agent import ChatRequest, ConfirmActionRequest, CreditStatusResponse
from app.services.agent_service import agent_service
from app.services.agent_credits import AgentCreditService
from app.services.subscription_service import SubscriptionService
from app.database.connection import redis_manager
from .auth import require_subscription

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent", tags=["agent"])


async def _get_plan_type(user_id: str) -> str:
    """Resolve the user's subscription plan type."""
    sub = await SubscriptionService.get_subscription(user_id)
    return sub.plan_type if sub else "monthly"


@router.post("/chat")
async def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(require_subscription),
):
    """SSE streaming chat endpoint. Deducts 1 credit per request."""
    plan_type = await _get_plan_type(current_user.id)

    # Import cached_rate_service from main (avoids circular imports)
    from app.main import cached_rate_service

    async def event_generator():
        async for chunk in agent_service.stream_chat(
            user_id=current_user.id,
            plan_type=plan_type,
            is_admin=current_user.is_admin,
            message=request.message,
            session_id=request.session_id,
            rate_service=cached_rate_service,
        ):
            yield chunk

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/confirm")
async def confirm_action(
    request: ConfirmActionRequest,
    current_user: User = Depends(require_subscription),
):
    """Execute or cancel a pending action (create_alert / add_to_watchlist)."""
    pending_key = f"goldie:pending:{request.session_id}:{request.nonce}"
    raw = await redis_manager.get(pending_key)

    if not raw:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Action expired or not found. Please try again.",
        )

    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid action data.",
        )

    # Verify ownership
    if payload.get("user_id") != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Action does not belong to this user.",
        )

    # Consume the pending key (one-time use)
    await redis_manager.delete(pending_key)

    if not request.confirmed:
        return {"status": "cancelled"}

    action = payload.get("action")
    params = payload.get("params", {})

    if action == "create_alert":
        try:
            from app.services.alert_service import alert_service
            from app.schemas.alerts import AlertCreate

            alert_data = AlertCreate(**params)
            alert = await alert_service.create_alert(current_user.id, alert_data)
            return {
                "status": "done",
                "action": "create_alert",
                "result": {"alert_id": alert.id, "message": "Alert created successfully!"},
            }
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        except Exception as e:
            logger.error("Failed to create alert from Goldie: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create alert. Please try again.",
            )

    elif action == "add_to_watchlist":
        try:
            from app.services.watchlist_service import watchlist_service
            from app.schemas.watchlist import (
                WatchlistScriptCreate, WatchlistCreate, UserSettingsUpdate,
            )
            from datetime import datetime

            scripts_list = params.get("scripts", [])
            new_watchlist_name = params.get("watchlist_name")

            if not scripts_list:
                raise ValueError("No scripts to add.")

            # --- Get or create watchlist ---
            user_data = await watchlist_service.get_user_watchlists(current_user.id)
            settings = user_data.get("settings")
            watchlists = user_data.get("watchlists", [])
            watchlist_id = settings.current_watchlist_id if settings else None

            # If user explicitly asked for a new watchlist, create it
            if new_watchlist_name:
                new_wl = await watchlist_service.create_watchlist(
                    current_user.id, WatchlistCreate(name=new_watchlist_name),
                )
                watchlist_id = new_wl.id
                await watchlist_service.update_user_settings(
                    current_user.id, UserSettingsUpdate(current_watchlist_id=watchlist_id),
                )
            elif not watchlist_id:
                # Try first existing watchlist
                if watchlists:
                    watchlist_id = watchlists[0].id
                else:
                    # Auto-create default watchlist
                    new_wl = await watchlist_service.create_watchlist(
                        current_user.id, WatchlistCreate(name="My Watchlist"),
                    )
                    watchlist_id = new_wl.id
                    await watchlist_service.update_user_settings(
                        current_user.id, UserSettingsUpdate(current_watchlist_id=watchlist_id),
                    )

            # --- Bulk add scripts ---
            now = datetime.utcnow()
            bulk_data = [
                WatchlistScriptCreate(
                    dealer_name=s["dealer_name"],
                    script_name=s["script_name"],
                    script_display_name=s.get("script_display_name"),
                    product_type=s.get("product_type", "gold"),
                    original_buy_rate=s.get("original_buy_rate"),
                    original_sell_rate=s.get("original_sell_rate"),
                    original_rates_timestamp=now,
                )
                for s in scripts_list
            ]
            added = await watchlist_service.add_scripts_bulk(
                current_user.id, watchlist_id, bulk_data,
            )

            count = len(added)
            msg = (
                f"Added {count} script{'s' if count != 1 else ''} to watchlist!"
                if count > 0
                else "Scripts already in watchlist (no duplicates added)."
            )
            return {
                "status": "done",
                "action": "add_to_watchlist",
                "result": {"scripts_added": count, "message": msg},
            }
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        except Exception as e:
            logger.error("Failed to add to watchlist from Goldie: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to add to watchlist. Please try again.",
            )

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown action: {action}",
        )


@router.get("/credits", response_model=CreditStatusResponse)
async def get_credits(
    current_user: User = Depends(require_subscription),
):
    """Return current credit balance (no credit deduction)."""
    plan_type = await _get_plan_type(current_user.id)
    return await AgentCreditService.get_status(
        current_user.id, plan_type, current_user.is_admin,
    )
