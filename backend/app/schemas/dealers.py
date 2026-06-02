"""
Pydantic schemas for dealer metadata API endpoints
"""

from pydantic import BaseModel
from typing import List, Optional


class DealerMetadataItem(BaseModel):
    dealer_id: str
    name: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    logo_url: Optional[str] = None


class DealerMetadataResponse(BaseModel):
    dealers: List[DealerMetadataItem]
    cities: List[str]
