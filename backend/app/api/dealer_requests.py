"""
Dealer request API endpoints
"""

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from urllib.parse import urlparse
import logging

from app.database.models import User, DealerRequest
from app.database.connection import AsyncSessionLocal
from .auth import require_subscription

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dealer-requests", tags=["dealer-requests"])


class DealerRequestCreate(BaseModel):
    dealer_name: str = Field(..., min_length=1, max_length=200)
    dealer_url: str = Field(..., min_length=1, max_length=500)
    notes: Optional[str] = Field(None, max_length=1000)

    @field_validator("dealer_url")
    @classmethod
    def validate_url_scheme(cls, v: str) -> str:
        parsed = urlparse(v.strip())
        if parsed.scheme not in ("http", "https"):
            raise ValueError("URL must use http or https")
        if not parsed.netloc or "." not in parsed.netloc:
            raise ValueError("Invalid URL")
        return v.strip()


class DealerRequestResponse(BaseModel):
    id: str
    dealer_name: str
    dealer_url: str
    notes: Optional[str]
    created_at: str


@router.post("", response_model=DealerRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_dealer_request(
    data: DealerRequestCreate,
    current_user: User = Depends(require_subscription),
):
    """Submit a request for a new bullion dealer to be added."""
    try:
        async with AsyncSessionLocal() as session:
            request = DealerRequest(
                user_id=current_user.id,
                dealer_name=data.dealer_name.strip(),
                dealer_url=data.dealer_url.strip(),
                notes=data.notes.strip() if data.notes else None,
            )
            session.add(request)
            await session.commit()
            await session.refresh(request)

            return DealerRequestResponse(
                id=str(request.id),
                dealer_name=request.dealer_name,
                dealer_url=request.dealer_url,
                notes=request.notes,
                created_at=request.created_at.isoformat(),
            )
    except Exception as e:
        logger.error(f"Error creating dealer request for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit dealer request",
        )
