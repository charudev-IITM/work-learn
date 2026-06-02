"""
Commodity News API endpoints.
Free for all authenticated users — uses get_current_user, NOT require_subscription.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional
from datetime import datetime
import logging

from app.database.models import User
from app.services.news_service import news_service
from app.schemas.news import NewsListResponse, NewsSearchResponse, NewsTagOptions, NewsArticleResponse
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/news", tags=["news"])


@router.get("", response_model=NewsListResponse)
async def list_news(
    commodity: Optional[str] = Query(None),
    topic: Optional[str] = Query(None),
    geography: Optional[str] = Query(None),
    sentiment: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    cursor: Optional[str] = Query(None, description="ISO datetime for cursor pagination"),
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    try:
        return await news_service.get_articles(
            commodity=commodity, topic=topic, geography=geography,
            sentiment=sentiment, source=source, date_from=date_from,
            date_to=date_to, cursor=cursor, limit=limit,
        )
    except Exception as e:
        logger.error("Error listing news: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch news",
        )


@router.get("/search", response_model=NewsSearchResponse)
async def search_news(
    q: str = Query(..., min_length=2),
    commodity: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
):
    try:
        result = await news_service.search_articles(
            query=q, commodity=commodity, source=source,
            limit=limit, offset=offset,
        )
        return NewsSearchResponse(
            hits=result.get("hits", []),
            total_hits=result.get("totalHits", result.get("estimatedTotalHits", 0)),
            query=q,
        )
    except Exception as e:
        logger.error("Error searching news: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Search failed",
        )


@router.get("/tags", response_model=NewsTagOptions)
async def get_tag_options(current_user: User = Depends(get_current_user)):
    """Returns distinct tag values for filter UI."""
    try:
        return await news_service.get_tag_options()
    except Exception as e:
        logger.error("Error fetching tag options: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch tags",
        )


@router.get("/{article_id}", response_model=NewsArticleResponse)
async def get_article(article_id: str, current_user: User = Depends(get_current_user)):
    article = await news_service.get_article_by_id(article_id)
    if not article:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Article not found",
        )
    return article
