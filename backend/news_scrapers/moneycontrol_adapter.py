"""
Moneycontrol commodities news adapter.
Primary: HTML scraping from moneycontrol.com/news/business/commodities/
Fallback: RSS feed
"""

from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from typing import List, Optional
import logging
import re

from .base import BaseNewsAdapter, ArticleData

logger = logging.getLogger(__name__)

MC_LISTING_URL = "https://www.moneycontrol.com/news/business/commodities/"
MC_RSS_URL = "https://www.moneycontrol.com/rss/commodities.xml"


class MoneycontrolNewsAdapter(BaseNewsAdapter):
    SOURCE_NAME = "moneycontrol"
    BASE_URL = "https://www.moneycontrol.com"

    async def fetch_articles(self) -> List[ArticleData]:
        html = await self._get_html(MC_LISTING_URL)
        if not html:
            return await self._fetch_rss_fallback()
        try:
            articles = self._parse_listing_html(html)
            if not articles:
                logger.warning("Moneycontrol: HTML parsing returned 0 articles, trying RSS")
                return await self._fetch_rss_fallback()
            return articles
        except Exception as e:
            logger.error("Moneycontrol: HTML parsing failed: %s", e)
            return await self._fetch_rss_fallback()

    def _parse_listing_html(self, html: str) -> List[ArticleData]:
        soup = BeautifulSoup(html, "html.parser")
        articles = []

        # Primary: find <li id="newslist-N"> items directly
        items = soup.find_all("li", id=re.compile(r"^newslist-\d+$"))

        if not items:
            # Fallback: legacy container
            news_list = soup.find("ul", id="caget498")
            items = news_list.find_all("li") if news_list else []

        if not items:
            items = soup.find_all("li", class_=re.compile(r".*clearfix.*", re.I))

        for item in items[:30]:
            try:
                article = self._parse_item(item)
                if article:
                    articles.append(article)
            except Exception:
                continue

        logger.info("Moneycontrol: parsed %d articles from HTML", len(articles))
        return articles

    def _parse_item(self, item) -> Optional[ArticleData]:
        heading = item.find(["h2", "h3"])
        if not heading:
            return None

        # Link may be inside heading (<h2><a>) or wrapping it (<a><h2>)
        link = heading.find("a") or heading.find_parent("a")
        if not link:
            return None

        title = heading.get_text(strip=True)
        if not title or len(title) < 10:
            return None

        href = link.get("href", "")
        if not href:
            return None
        if href.startswith("//"):
            href = "https:" + href

        # Timestamp
        published_at = datetime.utcnow()
        time_el = item.find(["span", "p"], class_=re.compile(r".*(ago|date|time).*", re.I))
        if time_el:
            published_at = _parse_relative_time(time_el.get_text(strip=True))

        # Summary
        summary_el = item.find("p")
        summary = summary_el.get_text(strip=True) if summary_el else None

        # Author
        author_el = item.find(class_=re.compile(r".*auth.*", re.I))
        author = author_el.get_text(strip=True) if author_el else None

        # Image
        image_url = self._extract_image(item)

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
            if re.search(r"(1x1|pixel|spacer|blank\.gif)", src, re.I):
                continue
            if src.startswith("//"):
                src = "https:" + src
            elif not src.startswith("http"):
                src = self.BASE_URL + src
            return src
        return None

    async def _fetch_rss_fallback(self) -> List[ArticleData]:
        """Parse Moneycontrol RSS as fallback."""
        try:
            import feedparser
        except ImportError:
            logger.error("feedparser not installed, RSS fallback unavailable")
            return []

        html = await self._get_html(MC_RSS_URL)
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

                # Clean HTML from RSS summary
                raw_summary = entry.get("summary", "")
                if raw_summary:
                    clean = BeautifulSoup(raw_summary, "html.parser").get_text(strip=True)
                else:
                    clean = None

                # Extract image from RSS media fields
                image_url = _extract_rss_image(entry)

                articles.append(ArticleData(
                    title=title,
                    source_url=link,
                    source=self.SOURCE_NAME,
                    published_at=pub,
                    summary=clean,
                    author=entry.get("author"),
                    image_url=image_url,
                ))
            except Exception:
                continue

        logger.info("Moneycontrol: parsed %d articles from RSS", len(articles))
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


def _parse_relative_time(text: str) -> datetime:
    """Convert '2 hours ago', '5 min ago' etc. to datetime."""
    text = text.lower().strip()
    now = datetime.utcnow()
    patterns = [
        (r"(\d+)\s*min", timedelta(minutes=1)),
        (r"(\d+)\s*hour", timedelta(hours=1)),
        (r"(\d+)\s*day", timedelta(days=1)),
    ]
    for pattern, delta in patterns:
        m = re.search(pattern, text)
        if m:
            return now - delta * int(m.group(1))
    return now
