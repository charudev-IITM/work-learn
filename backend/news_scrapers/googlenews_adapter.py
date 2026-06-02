"""
Google News commodities RSS adapter.
Free, no auth required, no anti-bot protection.
"""

from datetime import datetime
from typing import List, Optional
import logging

from .base import BaseNewsAdapter, ArticleData

logger = logging.getLogger(__name__)

# Indian commodities news — gold, silver, bullion focused
GOOGLE_NEWS_RSS_URL = (
    "https://news.google.com/rss/search"
    "?q=gold+silver+bullion+commodities"
    "&hl=en-IN&gl=IN&ceid=IN:en"
)


class GoogleNewsAdapter(BaseNewsAdapter):
    SOURCE_NAME = "googlenews"

    async def fetch_articles(self) -> List[ArticleData]:
        try:
            import feedparser
        except ImportError:
            logger.error("feedparser not installed")
            return []

        xml = await self._get_html(GOOGLE_NEWS_RSS_URL)
        if not xml:
            return []

        feed = feedparser.parse(xml)
        articles = []
        for entry in feed.entries[:30]:
            try:
                article = self._parse_entry(entry)
                if article:
                    articles.append(article)
            except Exception:
                continue

        logger.info("Google News: parsed %d articles from RSS", len(articles))
        return articles

    def _parse_entry(self, entry) -> Optional[ArticleData]:
        title = entry.get("title", "")
        link = entry.get("link", "")
        if not title or not link or len(title) < 10:
            return None

        # Parse "source - Title" format: Google News appends " - SourceName"
        source_name = None
        if " - " in title:
            title, source_name = title.rsplit(" - ", 1)

        # Published date
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            published_at = datetime(*entry.published_parsed[:6])
        else:
            published_at = datetime.utcnow()

        # Google News RSS doesn't include images or summaries
        return ArticleData(
            title=title.strip(),
            source_url=link,
            source=self.SOURCE_NAME,
            published_at=published_at,
            summary=None,
            author=source_name,  # Use the news outlet name as author
            image_url=None,
        )
