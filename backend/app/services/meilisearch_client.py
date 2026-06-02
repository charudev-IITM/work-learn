"""
Meilisearch client — thin async wrapper for news article indexing and search.
Meilisearch is eventually-consistent; PostgreSQL is the source of truth.
"""

import os
import logging
from typing import Any, Dict, List, Optional

import aiohttp

logger = logging.getLogger(__name__)

MEILI_URL = os.getenv("MEILISEARCH_URL", "http://localhost:7700")
MEILI_KEY = os.getenv("MEILISEARCH_MASTER_KEY", "meili_dev_key_123")
INDEX_NAME = "news_articles"


class MeilisearchClient:
    def __init__(self):
        self._base = MEILI_URL.rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {MEILI_KEY}",
            "Content-Type": "application/json",
        }
        self._session: Optional[aiohttp.ClientSession] = None

    async def start(self):
        self._session = aiohttp.ClientSession(headers=self._headers)
        await self._ensure_index()

    async def stop(self):
        if self._session:
            await self._session.close()
            self._session = None

    async def _ensure_index(self):
        """Create index and configure searchable/filterable attributes."""
        try:
            async with self._session.post(
                f"{self._base}/indexes",
                json={"uid": INDEX_NAME, "primaryKey": "id"},
            ) as resp:
                pass  # 201 created or 400 already exists — both OK

            async with self._session.patch(
                f"{self._base}/indexes/{INDEX_NAME}/settings",
                json={
                    "searchableAttributes": ["title", "summary", "author", "source"],
                    "filterableAttributes": [
                        "tag_commodity", "tag_topic", "tag_geography",
                        "tag_sentiment", "source",
                    ],
                    "sortableAttributes": ["published_at"],
                    "rankingRules": [
                        "words", "typo", "proximity", "attribute",
                        "sort", "exactness",
                    ],
                },
            ) as resp:
                if resp.status not in (200, 202):
                    body = await resp.text()
                    logger.warning("Meilisearch settings update %s: %s", resp.status, body)
            logger.info("Meilisearch index '%s' configured", INDEX_NAME)
        except Exception as e:
            logger.warning("Meilisearch setup failed (will retry on next scrape): %s", e)

    async def index_articles(self, articles: List[Dict[str, Any]]):
        """Upsert articles into Meilisearch. Each must have an 'id' field."""
        if not articles:
            return
        await self._ensure_session()
        if not self._session:
            return
        try:
            async with self._session.post(
                f"{self._base}/indexes/{INDEX_NAME}/documents",
                json=articles,
            ) as resp:
                if resp.status not in (200, 202):
                    body = await resp.text()
                    logger.error("Meilisearch index error %s: %s", resp.status, body)
        except Exception as e:
            logger.error("Meilisearch index_articles error: %s", e)

    async def _ensure_session(self):
        """Lazily create session if missing (handles uvicorn --reload).

        Only creates the HTTP session — does NOT re-run index configuration.
        Index setup runs once via start() at application startup.
        """
        if not self._session:
            self._session = aiohttp.ClientSession(headers=self._headers)

    async def search(
        self,
        query: str,
        filters: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Full-text search with optional Meilisearch filter expression."""
        await self._ensure_session()
        if not self._session:
            return {"hits": [], "totalHits": 0}

        body: Dict[str, Any] = {
            "q": query,
            "limit": limit,
            "offset": offset,
            "sort": ["published_at:desc"],
            "attributesToRetrieve": [
                "id", "title", "summary", "source", "source_url",
                "author", "published_at", "tag_commodity", "tag_topic",
                "tag_geography", "tag_sentiment",
            ],
        }
        if filters:
            body["filter"] = filters

        try:
            async with self._session.post(
                f"{self._base}/indexes/{INDEX_NAME}/search",
                json=body,
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
                logger.error("Meilisearch search error %s", resp.status)
        except Exception as e:
            logger.error("Meilisearch search error: %s", e)

        return {"hits": [], "totalHits": 0}


meili_client = MeilisearchClient()
