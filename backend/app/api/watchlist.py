"""
Watchlist API endpoints
Provides CRUD operations for user watchlists
"""

from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
import logging

from app.database.models import User
from app.services.watchlist_service import watchlist_service
from app.schemas.watchlist import (
    WatchlistCreate, WatchlistUpdate, WatchlistScriptCreate, WatchlistScriptUpdate,
    UserSettingsUpdate, ScriptReorderRequest,
    WatchlistResponse, WatchlistScriptResponse, UserSettingsResponse, WatchlistsResponse,
    ErrorResponse, ValidationErrorResponse
)
from .auth import require_subscription

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/watchlists", tags=["watchlists"])

# Settings routes - must come before /{watchlist_id} routes to avoid conflicts
@router.get("/settings", response_model=UserSettingsResponse)
async def get_user_settings(current_user: User = Depends(require_subscription)):
    try:
        result = await watchlist_service.get_user_watchlists(current_user.id)
        return result["settings"]
    except Exception as e:
        logger.error(f"Error fetching settings for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch user settings"
        )

@router.patch("/settings", response_model=UserSettingsResponse)
async def update_user_settings(
    settings_data: UserSettingsUpdate,
    current_user: User = Depends(require_subscription)
):
    try:
        return await watchlist_service.update_user_settings(current_user.id, settings_data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating settings for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update user settings"
        )

# Watchlist CRUD routes
@router.get("", response_model=WatchlistsResponse)
async def get_user_watchlists(current_user: User = Depends(require_subscription)):
    try:
        result = await watchlist_service.get_user_watchlists(current_user.id)
        return WatchlistsResponse(**result)
    except Exception as e:
        logger.error(f"Error fetching watchlists for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch watchlists"
        )

@router.post("", response_model=WatchlistResponse, status_code=status.HTTP_201_CREATED)
async def create_watchlist(
    watchlist_data: WatchlistCreate,
    current_user: User = Depends(require_subscription)
):
    try:
        return await watchlist_service.create_watchlist(current_user.id, watchlist_data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating watchlist for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create watchlist"
        )

@router.patch("/{watchlist_id}", response_model=WatchlistResponse)
async def update_watchlist(
    watchlist_id: str,
    update_data: WatchlistUpdate,
    current_user: User = Depends(require_subscription)
):
    try:
        return await watchlist_service.update_watchlist(current_user.id, watchlist_id, update_data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating watchlist {watchlist_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update watchlist"
        )

@router.delete("/{watchlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_watchlist(
    watchlist_id: str,
    current_user: User = Depends(require_subscription)
):
    try:
        await watchlist_service.delete_watchlist(current_user.id, watchlist_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting watchlist {watchlist_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete watchlist"
        )

@router.post("/{watchlist_id}/scripts", response_model=WatchlistScriptResponse, status_code=status.HTTP_201_CREATED)
async def add_script_to_watchlist(
    watchlist_id: str,
    script_data: WatchlistScriptCreate,
    current_user: User = Depends(require_subscription)
):
    try:
        return await watchlist_service.add_script_to_watchlist(current_user.id, watchlist_id, script_data)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error adding script to watchlist {watchlist_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add script to watchlist"
        )

@router.delete("/{watchlist_id}/scripts/{script_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_script_from_watchlist(
    watchlist_id: str,
    script_id: str,
    current_user: User = Depends(require_subscription)
):
    try:
        await watchlist_service.remove_script_from_watchlist(current_user.id, watchlist_id, script_id)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error removing script {script_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove script from watchlist"
        )

@router.patch("/{watchlist_id}/scripts/{script_id}/multiplier", response_model=WatchlistScriptResponse)
async def update_script_multiplier(
    watchlist_id: str,
    script_id: str,
    multiplier: float,
    current_user: User = Depends(require_subscription)
):
    try:
        return await watchlist_service.update_script_multiplier(
            current_user.id, watchlist_id, script_id, multiplier
        )
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating multiplier for script {script_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update script multiplier"
        )

@router.put("/{watchlist_id}/scripts/reorder", response_model=List[WatchlistScriptResponse])
async def reorder_scripts_in_watchlist(
    watchlist_id: str,
    reorder_data: ScriptReorderRequest,
    current_user: User = Depends(require_subscription)
):
    try:
        return await watchlist_service.reorder_scripts(current_user.id, watchlist_id, reorder_data)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error reordering scripts in watchlist {watchlist_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reorder scripts"
        )

# Bulk operations
@router.post("/{watchlist_id}/scripts/bulk", response_model=List[WatchlistScriptResponse], status_code=status.HTTP_201_CREATED)
async def add_multiple_scripts_to_watchlist(
    watchlist_id: str,
    scripts_data: List[WatchlistScriptCreate],
    current_user: User = Depends(require_subscription)
):
    try:
        return await watchlist_service.add_scripts_bulk(
            current_user.id, watchlist_id, scripts_data
        )
    except Exception as e:
        logger.error(f"Error adding multiple scripts to watchlist {watchlist_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add scripts to watchlist"
        )

@router.delete("/{watchlist_id}/scripts/bulk", status_code=status.HTTP_204_NO_CONTENT)
async def remove_multiple_scripts_from_watchlist(
    watchlist_id: str,
    script_ids: List[str],
    current_user: User = Depends(require_subscription)
):
    try:
        await watchlist_service.remove_scripts_bulk(
            current_user.id, watchlist_id, script_ids
        )
    except Exception as e:
        logger.error(f"Error removing multiple scripts from watchlist {watchlist_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove scripts from watchlist"
        )
