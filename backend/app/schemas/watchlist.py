"""
Pydantic schemas for watchlist API endpoints
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime
from enum import Enum

class ViewMode(str, Enum):
    buy = "buy"
    sell = "sell"
    differences = "differences"

class SortMode(str, Enum):
    rate_asc = "rate-asc"
    rate_desc = "rate-desc"
    dealer = "dealer"
    added = "added"
    difference_asc = "difference-asc"
    difference_desc = "difference-desc"
    none = "none"

class DifferenceType(str, Enum):
    buy = "buy"
    sell = "sell"

class LayoutMode(str, Enum):
    compact = "compact"
    card = "card"

# Request schemas
class WatchlistScriptCreate(BaseModel):
    dealer_name: str = Field(..., max_length=100)
    script_name: str = Field(..., max_length=200)
    script_display_name: Optional[str] = Field(None, max_length=200)
    product_type: str = Field(..., max_length=100)
    multiplier: Optional[float] = Field(1.0)
    original_buy_rate: Optional[float] = None
    original_sell_rate: Optional[float] = None
    original_rates_timestamp: Optional[datetime] = None

class WatchlistCreate(BaseModel):
    name: str = Field(..., max_length=100, min_length=1)

class WatchlistUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100, min_length=1)

class WatchlistScriptUpdate(BaseModel):
    multiplier: Optional[float] = Field(None)
    order_index: Optional[int] = Field(None, ge=0)

class ScriptReorderRequest(BaseModel):
    script_ids: List[str] = Field(..., min_length=1)

class UserSettingsUpdate(BaseModel):
    current_watchlist_id: Optional[str] = None
    view_mode: Optional[ViewMode] = None
    sort_mode: Optional[SortMode] = None
    reference_script_id: Optional[str] = None
    difference_type: Optional[DifferenceType] = None
    layout_mode: Optional[LayoutMode] = None
    city_filter: Optional[str] = None

# Response schemas
class WatchlistScriptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: str
    dealer_name: str
    script_name: str
    script_display_name: Optional[str]
    product_type: str
    multiplier: Optional[float]
    order_index: int
    added_at: datetime
    original_buy_rate: Optional[float]
    original_sell_rate: Optional[float]
    original_rates_timestamp: Optional[datetime]

class WatchlistResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: str
    name: str
    order_index: int
    created_at: datetime
    updated_at: datetime
    scripts: List[WatchlistScriptResponse] = []

class UserSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    current_watchlist_id: Optional[str]
    view_mode: ViewMode
    sort_mode: SortMode
    reference_script_id: Optional[str]
    difference_type: DifferenceType
    layout_mode: LayoutMode = LayoutMode.compact
    city_filter: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class WatchlistsResponse(BaseModel):
    watchlists: List[WatchlistResponse]
    settings: UserSettingsResponse

# Error response schemas
class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None

class ValidationErrorResponse(BaseModel):
    error: str
    detail: str
    validation_errors: List[dict]