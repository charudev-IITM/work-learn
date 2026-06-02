import asyncio
import json
import csv
import io
import hashlib
import sys
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import logging
from collections import defaultdict

from ..database.connection import redis_manager, shared_redis
from .differential_broadcast_manager import DifferentialBroadcastManager
from ..metrics import (
    RATE_UPDATES_TOTAL, RATE_UPDATES_SCRIPTS, HEARTBEATS_TOTAL,
    SCRAPER_LAST_UPDATE, SCRAPER_FRESHNESS, COMPETITORS_WITH_DATA,
    WEBSOCKET_MESSAGES_SENT, REDIS_PUBSUB_RECONNECTS,
)

# Import RateData from scrapers
sys.path.append(os.path.join(os.path.dirname(__file__), '../../'))
from scrapers.base.scraper import RateData

logger = logging.getLogger(__name__)

from ..constants import RATE_UPDATES_CHANNEL


class CachedRateService:
    """Enhanced rate service with Redis caching and pub/sub subscription.

    In multi-worker mode each API worker subscribes to the 'rate_updates'
    Redis pub/sub channel published by the scraper-worker process.  Each
    worker maintains its own in-memory current_rates and broadcasts to its
    own WebSocket connections.
    """

    # Seconds a symbol must be absent from scraper batches before heartbeat
    # stops refreshing its timestamp.  Must be > HEARTBEAT_INTERVAL (30s)
    # so that symbols from the last "rates changed" call don't expire before
    # the first heartbeat.  Also handles partial-batch scrapers (Socket.IO)
    # whose mainProduct/refProduct events arrive in separate calls.
    LAST_SEEN_THRESHOLD = 35

    def __init__(self):
        self.current_rates: Dict[str, Dict] = defaultdict(dict)
        self.competitor_scripts: Dict[str, List] = {}
        self.websocket_manager = None
        self.differential_broadcast_manager = None
        self.alert_evaluator = None
        self.alert_delivery_queue = None
        self.alert_service = None
        self.is_running = False

        # Rate change detection
        self.last_rate_hashes: Dict[str, str] = {}

        # Heartbeat: track last broadcast per competitor so we send
        # periodic updates even when rate values are unchanged.
        self._last_broadcast_times: Dict[str, datetime] = {}
        self.HEARTBEAT_INTERVAL_SECONDS = 30

        # Per-symbol last-seen times: when each symbol was last present
        # in a scraper batch.  Heartbeat only refreshes symbols seen
        # within LAST_SEEN_THRESHOLD — orphaned symbols age out naturally.
        self._last_seen: Dict[str, Dict[str, float]] = defaultdict(dict)

        # Memory cleanup tracking
        self._last_cleanup = None
        self._cleanup_interval_minutes = 60

        # Cache keys and settings
        self.CURRENT_RATES_CACHE_KEY = "current_rates:all"
        self.COMPETITOR_RATES_CACHE_KEY = "rates:competitor:{}"
        self.COMPETITOR_SCRIPTS_CACHE_KEY = "scripts:competitor:{}"
        self.COMPETITORS_CACHE_KEY = "competitors:all"
        self.CACHE_EXPIRE = 30
        self.SCRIPTS_CACHE_EXPIRE = 300

        # Pub/sub subscription tasks
        self._pubsub_task: Optional[asyncio.Task] = None
        self._admin_broadcast_task: Optional[asyncio.Task] = None

        # Batched pub/sub processing: buffer incoming messages and process
        # in batches to prevent event loop starvation.  Only the latest
        # rates per competitor are kept — intermediate updates are dropped.
        self._pending_updates: Dict[str, list] = {}

    async def start(self):
        """Start the rate service and subscribe to Redis pub/sub."""
        try:
            await redis_manager.connect()
            await shared_redis.connect()  # no-op if same instance
            self.is_running = True

            # Start Redis pub/sub subscriber (receives rates from scraper-worker)
            # ALL scrapers (VOTS, WinBull, Socket.IO, csvbullion, vasantbullion)
            # now publish via pub/sub — no Redis key polling needed.
            self._pubsub_task = asyncio.create_task(self._subscribe_rate_updates())

            # Subscribe to admin broadcast channel (announcements → all pods' WS connections)
            self._admin_broadcast_task = asyncio.create_task(self._subscribe_admin_broadcasts())

            logger.info("Cached rate service started with Redis pub/sub")
        except Exception as e:
            logger.warning(f"Redis not available, running without cache: {e}")
            self.is_running = True

    async def stop(self):
        """Stop the rate service"""
        self.is_running = False
        for task in [self._pubsub_task, self._admin_broadcast_task]:
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        try:
            if shared_redis is not redis_manager:
                await shared_redis.disconnect()
            await redis_manager.disconnect()
        except Exception:
            pass
        logger.info("Cached rate service stopped")

    def set_websocket_manager(self, websocket_manager):
        """Set the WebSocket manager for real-time updates"""
        self.websocket_manager = websocket_manager
        self.differential_broadcast_manager = DifferentialBroadcastManager(websocket_manager)
        logger.info("Differential broadcast manager initialized successfully")

    def set_alert_evaluator(self, evaluator, delivery_queue, alert_svc):
        """Set the alert evaluator for price alert checking"""
        self.alert_evaluator = evaluator
        self.alert_delivery_queue = delivery_queue
        self.alert_service = alert_svc
        logger.info("Alert evaluator wired into rate pipeline")

    # ------------------------------------------------------------------
    # Admin Broadcast Subscriber
    # ------------------------------------------------------------------

    async def _subscribe_admin_broadcasts(self):
        """Subscribe to admin_broadcast channel and forward to local WebSocket connections."""
        from ..constants import ADMIN_BROADCAST_CHANNEL
        retry_delay = 1

        while self.is_running:
            pubsub = redis_manager.async_redis_client.pubsub()
            try:
                await pubsub.subscribe(ADMIN_BROADCAST_CHANNEL)
                logger.info("Subscribed to admin broadcast channel")
                retry_delay = 1

                async for message in pubsub.listen():
                    if not self.is_running:
                        break
                    if message["type"] != "message":
                        continue
                    try:
                        data = json.loads(message["data"])
                        if self.websocket_manager:
                            await self.websocket_manager.broadcast_json(data)
                    except Exception as e:
                        logger.error("Error processing admin broadcast: %s", e)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("Admin broadcast subscription error: %s. Reconnecting in %ds", e, retry_delay)
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 30)
            finally:
                try:
                    await pubsub.unsubscribe(ADMIN_BROADCAST_CHANNEL)
                    await pubsub.aclose()
                except Exception:
                    pass

    # ------------------------------------------------------------------
    # Redis Pub/Sub Subscriber
    # ------------------------------------------------------------------

    async def _subscribe_rate_updates(self):
        """Subscribe to the rate_updates pub/sub channel.

        Messages are buffered into _pending_updates (latest per competitor)
        and processed in batches by _process_rate_batches() every 200ms.
        This prevents event loop starvation when 100+ scrapers publish
        every second during active market hours.
        """
        retry_delay = 1
        max_retry_delay = 30

        while self.is_running:
            pubsub = shared_redis.get_pubsub()
            if not pubsub:
                logger.warning("Redis pub/sub not available, retrying in %ds", retry_delay)
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, max_retry_delay)
                continue

            try:
                await pubsub.subscribe(RATE_UPDATES_CHANNEL)
                logger.info("Subscribed to Redis channel '%s'", RATE_UPDATES_CHANNEL)
                retry_delay = 1  # reset on success

                # Start the batch processor alongside the reader
                processor_task = asyncio.create_task(self._process_rate_batches())

                try:
                    async for message in pubsub.listen():
                        if not self.is_running:
                            break
                        if message["type"] != "message":
                            continue
                        try:
                            data = json.loads(message["data"])
                            competitor = data["competitor"]
                            rates = data["rates"]  # list of dicts
                            # Buffer only — latest per competitor wins
                            self._pending_updates[competitor] = rates
                        except Exception as e:
                            logger.error("Error parsing pub/sub message: %s", e)
                finally:
                    processor_task.cancel()
                    try:
                        await processor_task
                    except asyncio.CancelledError:
                        pass

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Pub/sub subscription error: %s. Reconnecting in %ds", e, retry_delay)
                REDIS_PUBSUB_RECONNECTS.inc()
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, max_retry_delay)
            finally:
                try:
                    await pubsub.unsubscribe(RATE_UPDATES_CHANNEL)
                    await pubsub.aclose()
                except Exception:
                    pass

    async def _process_rate_batches(self):
        """Process buffered rate updates in batches every 200ms.

        Between batches the event loop is free to serve HTTP requests
        and WebSocket frames.  Within a batch, asyncio.sleep(0) yields
        between competitors for additional responsiveness.
        """
        while self.is_running:
            await asyncio.sleep(0.2)  # 200ms batch window

            if not self._pending_updates:
                continue

            # Atomically swap out the pending buffer
            batch = self._pending_updates
            self._pending_updates = {}

            for competitor, rates in batch.items():
                try:
                    await self.handle_new_rates(competitor, rates)
                except Exception as e:
                    logger.error("Error processing rates for %s: %s", competitor, e)
                # Yield between competitors to keep event loop responsive
                await asyncio.sleep(0)

    # ------------------------------------------------------------------
    # Rate Handling
    # ------------------------------------------------------------------

    async def handle_new_rates(self, competitor_name: str, rates: List):
        """Handle new rates from pub/sub or direct callback."""
        try:
            current_rates_hash = self._hash_rates(competitor_name, rates)
            previous_hash = self.last_rate_hashes.get(competitor_name)
            now = datetime.utcnow()
            now_iso = now.isoformat()

            hash_unchanged = current_rates_hash == previous_hash

            if hash_unchanged:
                # Rates static — refresh timestamps for symbols recently seen
                # in a scraper batch (within _LAST_SEEN_THRESHOLD seconds).
                # Orphaned symbols (not seen recently) keep old timestamps.
                last_hb = self._last_broadcast_times.get(competitor_name)
                if last_hb and (now - last_hb).total_seconds() < self.HEARTBEAT_INTERVAL_SECONDS:
                    return

                now_ts = now.timestamp()
                threshold = self.LAST_SEEN_THRESHOLD
                last_seen = self._last_seen.get(competitor_name, {})
                comp_rates = self.current_rates.get(competitor_name, {})

                # Refresh timestamps for symbols seen within threshold.
                # Also refresh their _last_seen so they survive the next heartbeat.
                # Orphaned symbols (expired) are left untouched — their timestamps age.
                for sym in list(last_seen):
                    if now_ts - last_seen[sym] <= threshold:
                        last_seen[sym] = now_ts
                        if sym in comp_rates:
                            comp_rates[sym]['timestamp'] = now_iso

                # No WebSocket broadcast — frontend syncs via 30s HTTP poll.
                # Backend-side timestamp refresh (above) is sufficient.
                HEARTBEATS_TOTAL.labels(competitor=competitor_name).inc()
                SCRAPER_LAST_UPDATE.labels(scraper=competitor_name).set(now.timestamp())
                SCRAPER_FRESHNESS.labels(scraper=competitor_name).set(0)
                self._last_broadcast_times[competitor_name] = now
                return

            # Rates actually changed — full processing
            self.last_rate_hashes[competitor_name] = current_rates_hash

            scripts_for_competitor = []
            rate_data_objects = []
            now_ts = now.timestamp()

            for rate in rates:
                # Extract fields uniformly regardless of input type
                if hasattr(rate, 'script_name'):  # RateData object
                    symbol, sname = rate.symbol, rate.script_name
                    buy, sell = rate.buy_rate, rate.sell_rate
                    high, low, vol = rate.high_rate, rate.low_rate, rate.volume
                else:  # Dictionary format (from pub/sub)
                    symbol, sname = rate.get('symbol'), rate.get('script_name')
                    buy, sell = rate.get('buy_rate'), rate.get('sell_rate')
                    high, low, vol = rate.get('high_rate'), rate.get('low_rate'), rate.get('volume')

                # Rate is present in this batch → API returned it → it's LIVE.
                # Stamp with now_iso regardless of whether values changed.
                # Rates NOT in the batch (orphaned in current_rates) keep old timestamps.
                rate_data = {
                    'script_name': sname, 'symbol': symbol,
                    'buy_rate': buy, 'sell_rate': sell,
                    'high_rate': high, 'low_rate': low,
                    'timestamp': now_iso, 'volume': vol,
                }

                if hasattr(rate, 'script_name'):
                    rate.timestamp = now
                    rate_data_objects.append(rate)
                else:
                    rate_data_objects.append(RateData(
                        script_name=sname, symbol=symbol,
                        buy_rate=buy, sell_rate=sell,
                        high_rate=high, low_rate=low,
                        timestamp=now, volume=vol,
                    ))

                self.current_rates[competitor_name][symbol] = rate_data
                scripts_for_competitor.append({'name': sname, 'symbol': symbol})

                # Record when this symbol was last seen in a batch
                self._last_seen[competitor_name][symbol] = now_ts

            self.competitor_scripts[competitor_name] = scripts_for_competitor
            self._cleanup_memory()

            # Prometheus metrics
            RATE_UPDATES_TOTAL.labels(competitor=competitor_name).inc()
            RATE_UPDATES_SCRIPTS.labels(competitor=competitor_name).inc(len(rates))
            SCRAPER_LAST_UPDATE.labels(scraper=competitor_name).set(now.timestamp())
            SCRAPER_FRESHNESS.labels(scraper=competitor_name).set(0)
            COMPETITORS_WITH_DATA.set(len(self.current_rates))

            # Broadcast ALL accumulated rates for this competitor (not just
            # the current partial batch).  Scrapers like CSV Bullion fire
            # separate mainProduct/refProduct events — broadcasting only the
            # latest batch caused the DifferentialBroadcastManager to mark
            # the other batch's symbols as "removed".
            if self.differential_broadcast_manager and self.current_rates.get(competitor_name):
                all_rates = [
                    RateData(
                        script_name=rd['script_name'],
                        symbol=rd['symbol'],
                        buy_rate=rd['buy_rate'],
                        sell_rate=rd['sell_rate'],
                        high_rate=rd.get('high_rate'),
                        low_rate=rd.get('low_rate'),
                        timestamp=datetime.fromisoformat(rd['timestamp']),
                        volume=rd.get('volume'),
                    )
                    for rd in self.current_rates[competitor_name].values()
                ]
                await self.differential_broadcast_manager.broadcast_rate_changes(competitor_name, all_rates)

            self._last_broadcast_times[competitor_name] = now

            # Evaluate price alerts — synchronous check, delivery offloaded to queue
            if self.alert_evaluator and self.alert_delivery_queue and self.alert_service:
                self.alert_evaluator.evaluate(
                    competitor_name,
                    list(self.current_rates[competitor_name].values()),
                    self.alert_delivery_queue,
                    self.alert_service,
                )

        except Exception as e:
            logger.error(f"Error handling new rates from {competitor_name}: {e}")

    # ------------------------------------------------------------------
    # Read APIs
    # ------------------------------------------------------------------

    async def get_current_rates(self) -> Dict:
        # Return directly from in-memory store — each worker maintains its
        # own current_rates via Redis pub/sub, so the Redis cache round-trip
        # (serialize 294KB → SET → GET → deserialize) is pure overhead.
        return dict(self.current_rates)

    async def get_current_rates_by_competitor(self, competitor_name: str) -> Dict:
        try:
            cache_key = self.COMPETITOR_RATES_CACHE_KEY.format(competitor_name)
            cached_rates = await redis_manager.get_json(cache_key)
            if cached_rates:
                return cached_rates
        except Exception as e:
            logger.warning(f"Cache retrieval failed: {e}")

        result = {
            'competitor': competitor_name,
            'rates': self.current_rates.get(competitor_name, {})
        }
        try:
            await redis_manager.set_json(
                self.COMPETITOR_RATES_CACHE_KEY.format(competitor_name),
                result, self.CACHE_EXPIRE
            )
        except Exception as e:
            logger.warning(f"Cache storage failed: {e}")
        return result

    async def get_competitor_scripts(self, competitor_name: str) -> List:
        try:
            # Return from in-memory cache first (populated by handle_new_rates)
            if competitor_name in self.competitor_scripts:
                return self.competitor_scripts[competitor_name]

            if competitor_name in self.current_rates and self.current_rates[competitor_name]:
                scripts = []
                for symbol, rate_data in self.current_rates[competitor_name].items():
                    scripts.append({
                        'name': rate_data.get('script_name', symbol),
                        'symbol': symbol
                    })
                self.competitor_scripts[competitor_name] = scripts
                return scripts

            cache_key = self.COMPETITOR_SCRIPTS_CACHE_KEY.format(competitor_name)
            cached_scripts = await redis_manager.get_json(cache_key)
            if cached_scripts:
                return cached_scripts
        except Exception as e:
            logger.warning(f"Cache retrieval failed: {e}")

        return self.competitor_scripts.get(competitor_name, [])

    async def get_competitors_list(self) -> List:
        try:
            cached_competitors = await redis_manager.get_json(self.COMPETITORS_CACHE_KEY)
            if cached_competitors:
                return cached_competitors
        except Exception as e:
            logger.warning(f"Cache retrieval failed: {e}")

        competitors = list(self.current_rates.keys())
        try:
            await redis_manager.set_json(self.COMPETITORS_CACHE_KEY, competitors, self.SCRIPTS_CACHE_EXPIRE)
        except Exception as e:
            logger.warning(f"Cache storage failed: {e}")
        return competitors

    async def export_rates_csv(self) -> str:
        rates = await self.get_current_rates()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            'Competitor', 'Script Name', 'Symbol', 'Buy Rate', 'Sell Rate',
            'High Rate', 'Low Rate', 'Timestamp'
        ])
        for competitor, scripts in rates.items():
            for symbol, rate_data in scripts.items():
                writer.writerow([
                    competitor,
                    rate_data.get('script_name', ''),
                    symbol,
                    rate_data.get('buy_rate', ''),
                    rate_data.get('sell_rate', ''),
                    rate_data.get('high_rate', ''),
                    rate_data.get('low_rate', ''),
                    rate_data.get('timestamp', '')
                ])
        return output.getvalue()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _cache_current_rates(self):
        try:
            rates = dict(self.current_rates)
            await redis_manager.set_json(self.CURRENT_RATES_CACHE_KEY, rates, self.CACHE_EXPIRE)
        except Exception as e:
            logger.warning(f"Failed to cache current rates: {e}")

    async def _cache_competitor_scripts(self, competitor_name: str, scripts: List):
        try:
            cache_key = self.COMPETITOR_SCRIPTS_CACHE_KEY.format(competitor_name)
            await redis_manager.set_json(cache_key, scripts, self.SCRIPTS_CACHE_EXPIRE)
        except Exception as e:
            logger.warning(f"Failed to cache scripts for {competitor_name}: {e}")

    def _hash_rates(self, competitor_name: str, rates: List) -> int:
        try:
            rate_values = []
            for rate in rates:
                if hasattr(rate, 'script_name'):
                    values = (rate.script_name, rate.buy_rate, rate.sell_rate, rate.high_rate, rate.low_rate)
                else:
                    values = (rate.get('script_name'), rate.get('buy_rate'), rate.get('sell_rate'),
                              rate.get('high_rate'), rate.get('low_rate'))
                rate_values.append(values)
            rate_values.sort()
            return hash(tuple(rate_values))
        except Exception as e:
            logger.warning(f"Error hashing rates for {competitor_name}: {e}")
            return id(rates)  # unique per call, forces processing

    def _cleanup_memory(self):
        now = datetime.utcnow()
        if self._last_cleanup and (now - self._last_cleanup).total_seconds() < self._cleanup_interval_minutes * 60:
            return
        self._last_cleanup = now

        try:
            stale_competitors = []
            for competitor, rates in list(self.current_rates.items()):
                if not rates:
                    stale_competitors.append(competitor)
                    continue
                try:
                    latest_timestamp = max(
                        datetime.fromisoformat(rate_data.get('timestamp', '1970-01-01T00:00:00'))
                        for rate_data in rates.values()
                        if rate_data.get('timestamp')
                    )
                    if (now - latest_timestamp).total_seconds() > 6 * 3600:
                        stale_competitors.append(competitor)
                except Exception:
                    stale_competitors.append(competitor)

            for competitor in stale_competitors:
                self.current_rates.pop(competitor, None)
                self.competitor_scripts.pop(competitor, None)
                self.last_rate_hashes.pop(competitor, None)
                self._last_broadcast_times.pop(competitor, None)
                self._last_seen.pop(competitor, None)

            if stale_competitors:
                logger.info(f"Cleaned {len(stale_competitors)} stale competitors: {stale_competitors}")
        except Exception as e:
            logger.error(f"Cleanup error: {e}")

    async def force_full_sync(self, competitor: str = None):
        if self.differential_broadcast_manager:
            await self.differential_broadcast_manager.force_full_sync(competitor)

    def get_differential_stats(self) -> Dict:
        if self.differential_broadcast_manager:
            return self.differential_broadcast_manager.get_statistics()
        return {}
