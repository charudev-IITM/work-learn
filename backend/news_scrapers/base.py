"""
Base classes for news source adapters.
NOT a subclass of BaseScraper — news is batch/scheduled, not continuous streaming.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

import aiohttp
import asyncio
import logging

logger = logging.getLogger(__name__)


@dataclass
class ArticleData:
    """Standardized article data — analogous to RateData for rates."""
    title: str
    source_url: str
    source: str
    published_at: datetime
    summary: Optional[str] = None
    author: Optional[str] = None
    image_url: Optional[str] = None
    scraped_at: datetime = field(default_factory=datetime.utcnow)


class BaseNewsAdapter(ABC):
    """
    Base class for news source adapters.
    Each adapter fetches a batch of articles, parses HTML/RSS, returns ArticleData list.
    Use as async context manager for automatic session lifecycle.
    """

    SOURCE_NAME: str = ""

    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        self._headers = {
            "User-Agent": (
                "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 "
                "Mobile/15E148 Safari/604.1"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }

    async def __aenter__(self):
        connector = aiohttp.TCPConnector(limit=5, ttl_dns_cache=300)
        timeout = aiohttp.ClientTimeout(total=30, connect=10)
        self.session = aiohttp.ClientSession(
            connector=connector, headers=self._headers, timeout=timeout
        )
        return self

    async def __aexit__(self, *args):
        if self.session:
            await self.session.close()
            self.session = None

    @abstractmethod
    async def fetch_articles(self) -> List[ArticleData]:
        """Fetch and parse articles from the source."""
        pass

    async def _get_html(self, url: str) -> Optional[str]:
        """Fetch raw HTML with retry logic."""
        for attempt in range(3):
            try:
                async with self.session.get(url) as resp:
                    if resp.status == 200:
                        return await resp.text()
                    logger.warning("%s HTTP %s for %s", self.SOURCE_NAME, resp.status, url)
            except aiohttp.ClientError as e:
                logger.error("%s fetch error attempt %d: %s", self.SOURCE_NAME, attempt + 1, e)
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
        return None
