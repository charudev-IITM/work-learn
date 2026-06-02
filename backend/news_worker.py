"""
News Worker — Standalone process that scrapes commodity news every 5 minutes.
Runs independently of the API server and scraper_worker.

Usage: python news_worker.py
"""

import asyncio
import logging
import os
import sys
import signal
import time

sys.path.append(os.path.dirname(__file__))

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("news_worker")

POLL_INTERVAL = int(os.getenv("NEWS_POLL_INTERVAL", "300"))  # 5 minutes

# Prometheus metrics
from prometheus_client import Counter, Gauge, Histogram, start_http_server

NEWS_SCRAPE_TOTAL = Counter(
    "news_scrape_total",
    "Total news scrape cycles attempted",
)
NEWS_SCRAPE_SUCCESS = Counter(
    "news_scrape_success_total",
    "Successful news scrape cycles",
)
NEWS_SCRAPE_FAILURES = Counter(
    "news_scrape_failures_total",
    "Failed news scrape cycles",
)
NEWS_ARTICLES_FETCHED = Counter(
    "news_articles_fetched_total",
    "Total articles fetched from sources",
    ["source"],
)
NEWS_ARTICLES_INSERTED = Counter(
    "news_articles_inserted_total",
    "Total new articles inserted into DB",
)
NEWS_SOURCE_FAILURES = Counter(
    "news_source_failures_total",
    "Failures per news source",
    ["source"],
)
NEWS_SCRAPE_DURATION = Histogram(
    "news_scrape_duration_seconds",
    "Duration of each news scrape cycle",
    buckets=[1, 5, 10, 30, 60, 120, 300],
)
NEWS_LAST_SUCCESS = Gauge(
    "news_last_success_timestamp_seconds",
    "Unix timestamp of the last successful scrape cycle",
)


class NewsWorker:
    def __init__(self):
        self._shutdown = asyncio.Event()

    async def scrape_once(self):
        """Run both adapters concurrently, upsert results."""
        from news_scrapers.reuters_adapter import ReutersNewsAdapter
        from news_scrapers.moneycontrol_adapter import MoneycontrolNewsAdapter
        from news_scrapers.googlenews_adapter import GoogleNewsAdapter
        from app.services.news_service import news_service

        logger.info("Starting news scrape cycle")
        NEWS_SCRAPE_TOTAL.inc()
        start = time.time()

        try:
            async with (
                ReutersNewsAdapter() as reuters,
                MoneycontrolNewsAdapter() as mc,
                GoogleNewsAdapter() as gnews,
            ):
                reuters_result, mc_result, gnews_result = await asyncio.gather(
                    reuters.fetch_articles(),
                    mc.fetch_articles(),
                    gnews.fetch_articles(),
                    return_exceptions=True,
                )

            all_articles = []
            for name, result in [
                ("reuters", reuters_result),
                ("moneycontrol", mc_result),
                ("googlenews", gnews_result),
            ]:
                if isinstance(result, list):
                    all_articles.extend(result)
                    NEWS_ARTICLES_FETCHED.labels(source=name).inc(len(result))
                    logger.info("%s: %d articles fetched", name.capitalize(), len(result))
                else:
                    logger.error("%s scrape failed: %s", name.capitalize(), result)
                    NEWS_SOURCE_FAILURES.labels(source=name).inc()

            if all_articles:
                inserted = await news_service.upsert_articles(all_articles)
                NEWS_ARTICLES_INSERTED.inc(inserted)
                NEWS_SCRAPE_SUCCESS.inc()
                NEWS_LAST_SUCCESS.set(time.time())
                logger.info(
                    "Scrape cycle complete: %d fetched, %d new",
                    len(all_articles), inserted,
                )
            else:
                logger.warning("No articles fetched from any source")
                NEWS_SCRAPE_FAILURES.inc()

        except Exception as e:
            logger.error("Scrape cycle error: %s", e, exc_info=True)
            NEWS_SCRAPE_FAILURES.inc()
        finally:
            NEWS_SCRAPE_DURATION.observe(time.time() - start)

    async def run(self):
        from app.services.meilisearch_client import meili_client
        from app.database.connection import db_manager

        # Start Prometheus metrics server
        start_http_server(9091)
        logger.info("Prometheus metrics server started on :9091")

        # Initialize DB tables (idempotent)
        await db_manager.create_tables()

        # Initialize Meilisearch
        await meili_client.start()

        logger.info("News worker started. Poll interval: %ds", POLL_INTERVAL)

        while not self._shutdown.is_set():
            await self.scrape_once()
            try:
                await asyncio.wait_for(
                    self._shutdown.wait(),
                    timeout=POLL_INTERVAL,
                )
            except asyncio.TimeoutError:
                pass  # Normal: timeout = time to scrape again

        await meili_client.stop()
        logger.info("News worker stopped")

    def handle_signal(self):
        logger.info("Shutdown signal received")
        self._shutdown.set()


async def main():
    worker = NewsWorker()
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, worker.handle_signal)
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
