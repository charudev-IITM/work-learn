"""
Pydantic schemas for commodity news API endpoints
"""

from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class NewsArticleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    summary: Optional[str]
    source: str
    source_url: str
    author: Optional[str]
    published_at: datetime
    scraped_at: datetime
    image_url: Optional[str] = None
    tag_commodity: Optional[str]
    tag_topic: Optional[str]
    tag_geography: Optional[str]
    tag_sentiment: Optional[str]


class NewsListResponse(BaseModel):
    articles: list[NewsArticleResponse]
    next_cursor: Optional[str]
    has_more: bool


class NewsSearchResponse(BaseModel):
    hits: list[dict]
    total_hits: int
    query: str


class NewsTagOptions(BaseModel):
    commodities: list[str]
    topics: list[str]
    geographies: list[str]
    sentiments: list[str]
    sources: list[str]
