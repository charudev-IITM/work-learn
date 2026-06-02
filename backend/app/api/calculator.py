"""
Calculator formula API endpoints
Provides CRUD operations for user-defined computed value formulas
"""

from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
import logging

from app.database.models import User
from app.services.calculator_service import calculator_service
from app.schemas.calculator import FormulaCreate, FormulaUpdate, FormulaResponse
from .auth import require_subscription

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/formulas", tags=["calculator"])


@router.get("", response_model=List[FormulaResponse])
async def list_formulas(current_user: User = Depends(require_subscription)):
    try:
        return await calculator_service.get_formulas(current_user.id)
    except Exception as e:
        logger.error(f"Error fetching formulas for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch formulas"
        )


@router.post("", response_model=FormulaResponse, status_code=status.HTTP_201_CREATED)
async def create_formula(
    data: FormulaCreate,
    current_user: User = Depends(require_subscription)
):
    try:
        return await calculator_service.create_formula(current_user.id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating formula for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create formula"
        )


@router.put("/{formula_id}", response_model=FormulaResponse)
async def update_formula(
    formula_id: str,
    data: FormulaUpdate,
    current_user: User = Depends(require_subscription)
):
    try:
        return await calculator_service.update_formula(current_user.id, formula_id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating formula {formula_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update formula"
        )


@router.delete("/{formula_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_formula(
    formula_id: str,
    current_user: User = Depends(require_subscription)
):
    try:
        await calculator_service.delete_formula(current_user.id, formula_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting formula {formula_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete formula"
        )
