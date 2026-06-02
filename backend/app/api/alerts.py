"""
Price Alert API endpoints
Provides CRUD operations for user price alerts
"""

from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
import logging

from app.database.models import User
from app.services.alert_service import alert_service
from app.schemas.alerts import AlertCreate, AlertUpdate, AlertResponse
from .auth import require_subscription

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=List[AlertResponse])
async def list_alerts(current_user: User = Depends(require_subscription)):
    try:
        return await alert_service.get_alerts(current_user.id)
    except Exception as e:
        logger.error(f"Error fetching alerts for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch alerts"
        )


@router.post("", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
async def create_alert(
    data: AlertCreate,
    current_user: User = Depends(require_subscription)
):
    try:
        return await alert_service.create_alert(current_user.id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating alert for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create alert"
        )


@router.put("/{alert_id}", response_model=AlertResponse)
async def update_alert(
    alert_id: str,
    data: AlertUpdate,
    current_user: User = Depends(require_subscription)
):
    try:
        return await alert_service.update_alert(current_user.id, alert_id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating alert {alert_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update alert"
        )


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(
    alert_id: str,
    current_user: User = Depends(require_subscription)
):
    try:
        await alert_service.delete_alert(current_user.id, alert_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting alert {alert_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete alert"
        )
