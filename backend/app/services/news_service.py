"""
News service — upsert, list (cursor-paginated), search (Meilisearch), tag options.
Singleton pattern matching alert_service.py.
"""

import uuid
import logging
from datetime import datetime
from typing import Optional, Dict, Any

from sqlalchemy import select, func, distinct
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ..database.connection import AsyncSessionLocal, redis_manager
from ..database.models import NewsArticle
from ..schemas.news import NewsArticleResponse
from .meilisearch_client import meili_client

logger = logging.getLogger(__name__)


class NewsService:

    async def upsert_articles(self, raw_articles: list) -> int:
        """
        Insert articles, skipping duplicates by source_url UNIQUE constraint.
        Tags each article, stores to DB, indexes to Meilisearch.
        Returns count of newly inserted articles.
        """
        if not raw_articles:
            return 0

        from news_scrapers.tagger import tag_article

        inserted_count = 0
        meili_docs = []

        async with AsyncSessionLocal() as session:
            for art in raw_articles:
                tags = tag_article(art.title, art.summary)
                article_id = str(uuid.uuid4())

                stmt = (
                    pg_insert(NewsArticle)
                    .values(
                        id=article_id,
                        title=art.title,
                        summary=art.summary,
                        source=art.source,
                        source_url=art.source_url,
                        author=art.author,
                        published_at=art.published_at,
                        scraped_at=art.scraped_at,
                        image_url=art.image_url,
                        tag_commodity=tags["commodity"],
                        tag_topic=tags["topic"],
                        tag_geography=tags["geography"],
                        tag_sentiment=tags["sentiment"],
                    )
                    .on_conflict_do_nothing(index_elements=["source_url"])
                    .returning(NewsArticle.id)
                )
                result = await session.execute(stmt)
                row = result.fetchone()
                if row:
                    inserted_count += 1
                    meili_docs.append({
                        "id": row[0],
                        "title": art.title,
                        "summary": art.summary,
                        "source": art.source,
                        "source_url": art.source_url,
                        "author": art.author,
                        "published_at": art.published_at.isoformat() if art.published_at else None,
                        "image_url": art.image_url,
                        "tag_commodity": tags["commodity"],
                        "tag_topic": tags["topic"],
                        "tag_geography": tags["geography"],
                        "tag_sentiment": tags["sentiment"],
                    })

            await session.commit()

        # Index to Meilisearch (fire-and-forget — PG is source of truth)
        if meili_docs:
            await meili_client.index_articles(meili_docs)

        # Invalidate tag options cache when new articles arrive
        if inserted_count > 0:
            await redis_manager.delete("news:tag_options")

        logger.info("Upserted %d new articles (of %d fetched)", inserted_count, len(raw_articles))
        return inserted_count

    async def get_articles(
        self,
        commodity: Optional[str] = None,
        topic: Optional[str] = None,
        geography: Optional[str] = None,
        sentiment: Optional[str] = None,
        source: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        cursor: Optional[str] = None,
        limit: int = 20,
    ) -> Dict[str, Any]:
        """Cursor-based pagination using compound (published_at, id) cursor."""
        from sqlalchemy import or_, and_

        async with AsyncSessionLocal() as session:
            q = select(NewsArticle).order_by(
                NewsArticle.published_at.desc(), NewsArticle.id.desc()
            )

            if commodity:
                q = q.where(NewsArticle.tag_commodity == commodity)
            if topic:
                q = q.where(NewsArticle.tag_topic == topic)
            if geography:
                q = q.where(NewsArticle.tag_geography == geography)
            if sentiment:
                q = q.where(NewsArticle.tag_sentiment == sentiment)
            if source:
                q = q.where(NewsArticle.source == source)
            if date_from:
                q = q.where(NewsArticle.published_at >= date_from)
            if date_to:
                q = q.where(NewsArticle.published_at <= date_to)
            if cursor and "__" in cursor:
                cursor_dt_str, cursor_id = cursor.rsplit("__", 1)
                cursor_dt = datetime.fromisoformat(cursor_dt_str)
                q = q.where(or_(
                    NewsArticle.published_at < cursor_dt,
                    and_(
                        NewsArticle.published_at == cursor_dt,
                        NewsArticle.id < cursor_id,
                    ),
                ))

            q = q.limit(limit + 1)
            result = await session.execute(q)
            rows = result.scalars().all()

            has_more = len(rows) > limit
            rows = rows[:limit]
            next_cursor = (
                f"{rows[-1].published_at.isoformat()}__{rows[-1].id}"
                if has_more and rows else None
            )

            return {
                "articles": [NewsArticleResponse.model_validate(r) for r in rows],
                "next_cursor": next_cursor,
                "has_more": has_more,
            }

    _VALID_SOURCES = {"reuters", "moneycontrol", "googlenews"}

    async def search_articles(
        self,
        query: str,
        commodity: Optional[str] = None,
        source: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Delegate full-text search to Meilisearch."""
        filters = []
        # Validate filter values to prevent Meilisearch filter injection
        if commodity and commodity.isalpha():
            filters.append(f'tag_commodity = "{commodity}"')
        if source and source in self._VALID_SOURCES:
            filters.append(f'source = "{source}"')
        filter_str = " AND ".join(filters) if filters else None

        return await meili_client.search(query, filter_str, limit, offset)

    async def get_article_by_id(self, article_id: str) -> Optional[NewsArticleResponse]:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(NewsArticle).where(NewsArticle.id == article_id)
            )
            row = result.scalar_one_or_none()
            return NewsArticleResponse.model_validate(row) if row else None

    async def get_tag_options(self) -> Dict[str, Any]:
        """Return distinct tag values for filter UI. Cached in Redis for 15min."""
        cached = await redis_manager.get_json("news:tag_options")
        if cached:
            return cached

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(
                    func.array_agg(distinct(NewsArticle.tag_commodity)).label("commodities"),
                    func.array_agg(distinct(NewsArticle.tag_topic)).label("topics"),
                    func.array_agg(distinct(NewsArticle.tag_geography)).label("geographies"),
                )
            )
            row = result.fetchone()
            options = {
                "commodities": sorted([x for x in (row.commodities or []) if x]),
                "topics": sorted([x for x in (row.topics or []) if x]),
                "geographies": sorted([x for x in (row.geographies or []) if x]),
                "sentiments": ["Bullish", "Bearish", "Neutral"],
                "sources": ["reuters", "moneycontrol", "googlenews"],
            }

        await redis_manager.set_json("news:tag_options", options, expire=900)
        return options


news_service = NewsService()
