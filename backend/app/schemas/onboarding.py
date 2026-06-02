"""
Pydantic schemas for onboarding API endpoints
"""

from pydantic import BaseModel, Field
from typing import List, Literal, Optional
from datetime import datetime


# ── Request Schemas ──────────────────────────────────────────────────────────

class OnboardingStateUpdate(BaseModel):
    step: str = Field(..., max_length=50)
    commodities: Optional[List[str]] = None
    dealer_ids: Optional[List[str]] = None


class OnboardingEventCreate(BaseModel):
    step: str = Field(..., max_length=50)
    event_type: str = Field(..., max_length=20)  # 'entered', 'completed', 'skipped'
    metadata: Optional[dict] = None


class CreateWatchlistRequest(BaseModel):
    commodities: List[str] = Field(..., min_length=1)
    dealer_ids: List[str] = Field(..., min_length=1)


# ── Response Schemas ─────────────────────────────────────────────────────────

class OnboardingStateResponse(BaseModel):
    step: Optional[str] = None
    commodities: List[str] = []
    dealer_ids: List[str] = []
    watchlist_id: Optional[str] = None
    started_at: Optional[str] = None
    updated_at: Optional[str] = None


class CatalogScript(BaseModel):
    symbol: str
    display_name: str
    product_type: str
    buy_rate: Optional[float] = None
    sell_rate: Optional[float] = None
    purity: Optional[str] = None        # e.g. "999", "995", "916", "750"
    weight: Optional[str] = None        # e.g. "1g", "10g", "100g", "1kg"


class CatalogDealer(BaseModel):
    dealer_id: str
    display_name: str
    city: Optional[str] = None
    logo_url: Optional[str] = None
    is_popular: bool = False
    scripts: List[CatalogScript] = []
    script_count: int = 0


class CatalogCommodity(BaseModel):
    name: str
    dealers: List[CatalogDealer] = []
    dealer_count: int = 0


class CatalogResponse(BaseModel):
    commodities: List[CatalogCommodity] = []
    total_dealers: int = 0


class PreviewScriptInfo(BaseModel):
    dealer_name: str
    script_name: str
    display_name: str
    product_type: str
    buy_rate: Optional[float] = None
    sell_rate: Optional[float] = None


class CreateWatchlistResponse(BaseModel):
    watchlist_id: str
    scripts_added: int
    preview_scripts: List[PreviewScriptInfo] = []


class PreviewTimerStatusResponse(BaseModel):
    elapsed_seconds: int = Field(ge=0)
    remaining_seconds: int = Field(ge=0)
    paused: bool
    expired: bool


# ── Watchlist Suggestions ───────────────────────────────────────────────────

class WatchlistSuggestion(BaseModel):
    dealer_id: str
    dealer_display_name: str
    script_name: str            # symbol key
    script_display_name: str    # original script name
    canonical_type: str
    buy_rate: Optional[float] = None
    sell_rate: Optional[float] = None
    suggestion_type: Literal["similar_dealer", "different_product"]
    reason: str


class WatchlistSuggestionsResponse(BaseModel):
    suggestions: List[WatchlistSuggestion] = []
    watchlist_commodity: Optional[str] = None
