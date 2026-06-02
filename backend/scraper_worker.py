"""
Scraper Worker - Standalone process that runs all scrapers and publishes
rate updates to Redis pub/sub channel 'rate_updates'.

Decoupled from the API server so the API can scale to multiple workers
while scrapers run in a single dedicated process.
"""

import asyncio
import hashlib
import json
import logging
import os
import sys
import signal
import time

import redis.asyncio as aioredis

sys.path.append(os.path.dirname(__file__))

from scrapers import get_all_scrapers, SCRAPERS
from scrapers.base.scraper import RateData
from app.services.async_rate_service import AsyncRateService
from app.metrics import (
    SCRAPER_LAST_UPDATE, SCRAPER_FRESHNESS, SCRAPER_HEALTHY,
    SCRAPER_RUNNING, SCRAPER_RESTARTS, RATE_UPDATES_TOTAL,
    RATE_UPDATES_SCRIPTS,
)

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("scraper_worker")

from app.constants import RATE_UPDATES_CHANNEL

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


class ScraperWorker:
    """Runs scrapers and publishes rate updates to Redis pub/sub."""

    HEARTBEAT_INTERVAL = 30  # Re-publish unchanged rates every 30s for backend heartbeats

    def __init__(self):
        self.redis: aioredis.Redis | None = None
        self.rate_service = AsyncRateService()
        self._shutdown_event = asyncio.Event()
        self._last_rate_hashes: dict[str, str] = {}
        self._last_publish_times: dict[str, float] = {}

    def _hash_rates(self, rates: list) -> str:
        """Compute hash of rate values for dedup."""
        rate_values = []
        for r in rates:
            if hasattr(r, "script_name"):
                rate_values.append((r.script_name, r.buy_rate, r.sell_rate, r.high_rate, r.low_rate))
            else:
                rate_values.append((r.get("script_name"), r.get("buy_rate"), r.get("sell_rate"),
                                    r.get("high_rate"), r.get("low_rate")))
        rate_values.sort()
        return hashlib.md5(json.dumps(rate_values).encode()).hexdigest()

    async def start(self):
        logger.info("Connecting to Redis at %s", REDIS_URL)
        self.redis = aioredis.from_url(REDIS_URL, decode_responses=True)
        await self.redis.ping()
        logger.info("Redis connected (pub/sub client)")

        # Rate callback publishes to Redis pub/sub — with hash dedup
        # to avoid flooding the backend event loop with unchanged rates.
        async def rate_callback(competitor_name: str, rates: list):
            try:
                current_hash = self._hash_rates(rates)
                now = time.monotonic()
                prev_hash = self._last_rate_hashes.get(competitor_name)
                last_pub = self._last_publish_times.get(competitor_name, 0)

                # Skip if rates unchanged AND heartbeat not yet due
                if prev_hash == current_hash and (now - last_pub) < self.HEARTBEAT_INTERVAL:
                    return

                self._last_rate_hashes[competitor_name] = current_hash
                self._last_publish_times[competitor_name] = now

                message = json.dumps({
                    "competitor": competitor_name,
                    "rates": [r.to_dict() if hasattr(r, 'to_dict') else r for r in rates],
                })
                await self.redis.publish(RATE_UPDATES_CHANNEL, message)
                RATE_UPDATES_TOTAL.labels(competitor=competitor_name).inc()
                RATE_UPDATES_SCRIPTS.labels(competitor=competitor_name).inc(len(rates))
                logger.debug("Published %d rates for %s", len(rates), competitor_name)
            except Exception as e:
                logger.error("Failed to publish rates for %s: %s", competitor_name, e)

        logger.info("Starting AsyncRateService with %d scrapers", len(SCRAPERS))
        await self.rate_service.start(rate_callback=rate_callback)

        scrapers_status = await self.rate_service.get_all_scrapers_status()
        running = [n for n, s in scrapers_status.items() if s and s.get("is_running")]
        logger.info("Scraper worker running: %d/%d scrapers active", len(running), len(SCRAPERS))

    async def _metrics_loop(self):
        """Update Prometheus gauges for each scraper every 10s."""
        from prometheus_client import start_http_server
        start_http_server(9090)
        logger.info("Prometheus metrics server started on :9090")

        while not self._shutdown_event.is_set():
            try:
                now_ts = time.time()
                for name in self.rate_service.available_scrapers:
                    task = self.rate_service.scraper_tasks.get(name)
                    is_running = 1 if (task and not task.done()) else 0
                    SCRAPER_RUNNING.labels(scraper=name).set(is_running)

                    is_healthy = 1 if await self.rate_service._is_scraper_healthy(name) else 0
                    SCRAPER_HEALTHY.labels(scraper=name).set(is_healthy)

                    restarts = len(self.rate_service.restart_counts.get(name, []))
                    SCRAPER_RESTARTS.labels(scraper=name).set(restarts)

                    last_act = self.rate_service.last_activity.get(name)
                    if last_act:
                        ts = last_act.timestamp()
                        SCRAPER_LAST_UPDATE.labels(scraper=name).set(ts)
                        SCRAPER_FRESHNESS.labels(scraper=name).set(now_ts - ts)
            except Exception as e:
                logger.debug("Metrics refresh error: %s", e)
            await asyncio.sleep(10)

    async def run(self):
        await self.start()
        asyncio.create_task(self._metrics_loop())
        # Block until shutdown signal
        await self._shutdown_event.wait()
        await self.stop()

    async def stop(self):
        logger.info("Shutting down scraper worker...")
        await self.rate_service.stop()
        if self.redis:
            await self.redis.aclose()
        logger.info("Scraper worker stopped")

    def request_shutdown(self):
        self._shutdown_event.set()


async def main():
    worker = ScraperWorker()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, worker.request_shutdown)

    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
