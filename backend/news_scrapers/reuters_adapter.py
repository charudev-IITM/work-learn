"""
Reuters commodities news adapter.
Primary: HTML scraping via Zyte API (httpResponseBody — proxy-only, no browser).
Fallback: RSS feed
"""

from base64 import b64decode
from bs4 import BeautifulSoup
from datetime import datetime
from typing import List, Optional
import json
import logging
import os
import re

import aiohttp

from .base import BaseNewsAdapter, ArticleData

logger = logging.getLogger(__name__)

REUTERS_LISTING_URL = "https://www.reuters.com/markets/commodities/"
ZYTE_API_KEY = os.environ.get("ZYTE_API_KEY", "")


class ReutersNewsAdapter(BaseNewsAdapter):
    SOURCE_NAME = "reuters"
    BASE_URL = "https://www.reuters.com"

    async def __aenter__(self):
        await super().__aenter__()
        if ZYTE_API_KEY:
            connector = aiohttp.TCPConnector(limit=5, ttl_dns_cache=300)
            timeout = aiohttp.ClientTimeout(total=60, connect=15)
            old_session = self.session
            self.session = aiohttp.ClientSession(
                connector=connector, timeout=timeout
            )
            if old_session:
                await old_session.close()
        return self

    async def _get_html(self, url: str) -> Optional[str]:
        """Fetch via Zyte API proxy to bypass DataDome."""
        if ZYTE_API_KEY:
            return await self._fetch_via_zyte(url)
        return await super()._get_html(url)

    async def _fetch_via_zyte(self, url: str) -> Optional[str]:
        """POST to Zyte API extract endpoint with httpResponseBody (proxy-only, no browser)."""
        zyte_url = "https://api.zyte.com/v1/extract"
        auth = aiohttp.BasicAuth(ZYTE_API_KEY, "")
        payload = {"url": url, "httpResponseBody": True}

        for attempt in range(3):
            try:
                async with self.session.post(
                    zyte_url, json=payload, auth=auth
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        encoded = data.get("httpResponseBody", "")
                        return b64decode(encoded).decode("utf-8") if encoded else ""
                    body = await resp.text()
                    logger.warning(
                        "Zyte API %s for %s: %s", resp.status, url, body[:200]
                    )
            except aiohttp.ClientError as e:
                logger.error("Zyte fetch error attempt %d: %s", attempt + 1, e)
                if attempt < 2:
                    import asyncio
                    await asyncio.sleep(2 ** attempt)
        return None

    async def fetch_articles(self) -> List[ArticleData]:
        html = await self._get_html(REUTERS_LISTING_URL)
        if not html:
            logger.warning("Reuters: HTML fetch failed, trying RSS fallback")
            return await self._fetch_rss_fallback()
        try:
            articles = self._parse_listing_html(html)
            if not articles:
                logger.warning("Reuters: HTML parsing returned 0 articles, trying RSS")
                return await self._fetch_rss_fallback()
            return articles
        except Exception as e:
            logger.error("Reuters: HTML parsing failed: %s", e)
            return await self._fetch_rss_fallback()

    def _parse_listing_html(self, html: str) -> List[ArticleData]:
        soup = BeautifulSoup(html, "html.parser")
        articles = []

        # Reuters 2026 DOM: MediaStoryCard elements with Heading links
        cards = soup.find_all(attrs={"data-testid": "MediaStoryCard"})
        if not cards:
            # Fallback: older DOM patterns
            cards = soup.find_all("li", attrs={"data-testid": re.compile(r".*story.*", re.I)})
        if not cards:
            cards = soup.find_all("article")

        for card in cards[:30]:
            try:
                article = self._parse_card(card)
                if article:
                    articles.append(article)
            except Exception:
                continue

        logger.info("Reuters: parsed %d articles from HTML", len(articles))
        return articles

    def _parse_card(self, card) -> Optional[ArticleData]:
        # Title — look for Heading data-testid first (2026 DOM)
        heading = card.find("a", attrs={"data-testid": "Heading"})
        if not heading:
            heading = card.find("a", attrs={"data-testid": re.compile(r".*[Hh]eading.*")})
        if not heading:
            heading = card.find(["h3", "h2"])
            if heading:
                link = heading.find("a")
                if link:
                    heading = link
        if not heading:
            heading = card.find("a")
        if not heading:
            return None

        title = heading.get_text(strip=True)
        if not title or len(title) < 10:
            return None

        # URL
        href = heading.get("href", "")
        if href and not href.startswith("http"):
            href = self.BASE_URL + href
        if not href:
            return None

        # Skip non-article links
        if "/video/" in href or "/pictures/" in href:
            return None

        # Timestamp
        time_el = card.find("time")
        published_at = datetime.utcnow()
        if time_el and time_el.get("datetime"):
            try:
                dt_str = time_el["datetime"].replace("Z", "+00:00")
                published_at = datetime.fromisoformat(dt_str).replace(tzinfo=None)
            except ValueError:
                pass

        # Summary
        desc = card.find(attrs={"data-testid": "Text"})
        if not desc:
            desc = card.find("p")
        summary = desc.get_text(strip=True) if desc else None

        # Author
        author_el = card.find(attrs={"data-testid": re.compile(r".*[Aa]uthor.*")})
        author = author_el.get_text(strip=True) if author_el else None

        # Image
        image_url = self._extract_image(card)

        return ArticleData(
            title=title,
            source_url=href,
            source=self.SOURCE_NAME,
            published_at=published_at,
            summary=summary,
            author=author,
            image_url=image_url,
        )

    def _extract_image(self, element) -> Optional[str]:
        """Extract a meaningful image URL from an HTML element, skipping placeholders."""
        for img in element.find_all("img"):
            src = img.get("data-src") or img.get("src") or ""
            if not src or src.startswith("data:"):
                continue
            # Skip tracking pixels / spacers
            if re.search(r"(1x1|pixel|spacer|blank\.gif)", src, re.I):
                continue
            if not src.startswith("http"):
                src = self.BASE_URL + src
            return src
        return None

    async def _fetch_rss_fallback(self) -> List[ArticleData]:
        """Parse Reuters RSS as fallback — more stable than HTML selectors."""
        try:
            import feedparser
        except ImportError:
            logger.error("feedparser not installed, RSS fallback unavailable")
            return []

        # Reuters business news RSS
        rss_url = "https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best"
        html = await self._get_html(rss_url)
        if not html:
            return []

        feed = feedparser.parse(html)
        articles = []
        for entry in feed.entries[:20]:
            try:
                if hasattr(entry, "published_parsed") and entry.published_parsed:
                    pub = datetime(*entry.published_parsed[:6])
                else:
                    pub = datetime.utcnow()

                title = entry.get("title", "")
                link = entry.get("link", "")
                if not title or not link:
                    continue

                # Extract image from RSS media fields
                image_url = _extract_rss_image(entry)

                articles.append(ArticleData(
                    title=title,
                    source_url=link,
                    source=self.SOURCE_NAME,
                    published_at=pub,
                    summary=entry.get("summary", ""),
                    author=entry.get("author"),
                    image_url=image_url,
                ))
            except Exception:
                continue

        logger.info("Reuters: parsed %d articles from RSS", len(articles))
        return articles


def _extract_rss_image(entry) -> Optional[str]:
    """Extract image URL from RSS media_content, media_thumbnail, or enclosures."""
    for attr in ("media_content", "media_thumbnail"):
        items = getattr(entry, attr, None)
        if items:
            for item in items:
                url = item.get("url", "")
                if url and not url.startswith("data:"):
                    return url
    for enc in getattr(entry, "enclosures", []):
        etype = enc.get("type", "")
        if etype.startswith("image/"):
            return enc.get("href") or enc.get("url", "")
    return None
