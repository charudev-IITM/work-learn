"""
Pydantic schemas for Goldie AI Agent API endpoints
"""

from pydantic import BaseModel, Field
from typing import Optional


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: Optional[str] = None


class ConfirmActionRequest(BaseModel):
    session_id: str
    nonce: str
    confirmed: bool


class CreditStatusResponse(BaseModel):
    credits_remaining: int
    credits_total: int
    plan_type: str
    resets_at: str  # ISO date string (next UTC midnight)
