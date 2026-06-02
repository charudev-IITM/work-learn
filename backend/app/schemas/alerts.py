"""
Pydantic schemas for price alert API endpoints
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime
from enum import Enum


class AlertCondition(str, Enum):
    above = "above"
    below = "below"


class AlertRateType(str, Enum):
    buy = "buy"
    sell = "sell"


class AlertTriggerMode(str, Enum):
    one_shot = "one_shot"
    persistent = "persistent"


# Request schemas
class AlertCreate(BaseModel):
    dealer_name: str = Field(..., max_length=100)
    script_name: str = Field(..., max_length=200)
    condition: AlertCondition
    rate_type: AlertRateType
    threshold: float = Field(..., gt=0)
    trigger_mode: AlertTriggerMode = AlertTriggerMode.one_shot
    cooldown_minutes: int = Field(default=30, ge=5, le=10080)


class AlertUpdate(BaseModel):
    threshold: Optional[float] = Field(None, gt=0)
    condition: Optional[AlertCondition] = None
    rate_type: Optional[AlertRateType] = None
    is_active: Optional[bool] = None
    trigger_mode: Optional[AlertTriggerMode] = None
    cooldown_minutes: Optional[int] = Field(None, ge=5, le=10080)


# Response schema
class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    dealer_name: str
    script_name: str
    condition: str
    rate_type: str
    threshold: float
    is_active: bool
    trigger_mode: str
    cooldown_minutes: int
    last_triggered_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
