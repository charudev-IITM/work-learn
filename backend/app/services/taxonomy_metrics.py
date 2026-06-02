"""
Export dealer taxonomy and registry data as Prometheus metrics.

Runs every 45s in the backend API process, populating gauges that Grafana's
"Dealer Intelligence" dashboard queries.
"""

import logging
import time
from collections import Counter
from typing import Dict, Optional

from ..metrics import (
    DEALER_TOTAL,
    DEALER_COUNT_BY_TYPE,
    DEALER_CITIES_TOTAL,
    DEALER_SCRIPTS_TOTAL,
    TAXONOMY_SCRIPTS_BY_COMMODITY,
    TAXONOMY_SCRIPTS_BY_PURITY,
    TAXONOMY_DEALERS_BY_CITY,
    TAXONOMY_SCRIPTS_BY_WEIGHT,
    TAXONOMY_SCRIPTS_BY_FORM,
    DEALER_INFO,
    DEALER_SCRIPT_TAXONOMY,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Dealer type map — built once at import time from config dicts
# ---------------------------------------------------------------------------

from scrapers.vots.vots_scraper import VOTS_DEALERS
from scrapers.winbull.winbull_scraper import WINBULL_DEALERS
from scrapers.socketio.socketio_scraper import SOCKETIO_DEALERS

DEALER_TYPE_MAP: Dict[str, str] = {}
for _name in VOTS_DEALERS:
    DEALER_TYPE_MAP[_name] = "vots"
for _name in WINBULL_DEALERS:
    DEALER_TYPE_MAP[_name] = "winbull"
for _name in SOCKETIO_DEALERS:
    DEALER_TYPE_MAP[_name] = "socketio"
for _name in ("csvbullion", "rsbl", "vasantbullion"):
    DEALER_TYPE_MAP[_name] = "custom"

# ---------------------------------------------------------------------------
# Dealer metadata cache (city/state from Redis, refreshed every 10 min)
# ---------------------------------------------------------------------------

_metadata_cache: Dict[str, Dict[str, str]] = {}
_metadata_cache_time: float = 0.0
_METADATA_CACHE_TTL = 600  # 10 minutes


async def _fetch_dealer_metadata(shared_redis) -> Dict[str, Dict[str, str]]:
    """Fetch dealer city/state from Redis hashes, with module-level TTL cache."""
    global _metadata_cache, _metadata_cache_time

    now = time.monotonic()
    if _metadata_cache and (now - _metadata_cache_time) < _METADATA_CACHE_TTL:
        return _metadata_cache

    redis = shared_redis.async_redis_client
    if not redis:
        return _metadata_cache  # return stale if Redis unavailable

    try:
        dealer_ids = await redis.smembers("dealer:metadata:all")
        if not dealer_ids:
            return _metadata_cache

        pipe = redis.pipeline()
        sorted_ids = sorted(
            d.decode() if isinstance(d, bytes) else d for d in dealer_ids
        )
        for did in sorted_ids:
            pipe.hgetall(f"dealer:metadata:{did}")
        results = await pipe.execute()

        new_cache = {}
        for data in results:
            if not data:
                continue
            decoded = {
                (k.decode() if isinstance(k, bytes) else k): (v.decode() if isinstance(v, bytes) else v)
                for k, v in data.items()
            }
            did = decoded.get("dealer_id")
            if did:
                new_cache[did] = {
                    "city": decoded.get("city") or "",
                    "state": decoded.get("state") or "",
                }

        _metadata_cache = new_cache
        _metadata_cache_time = now
    except Exception as e:
        logger.debug("Dealer metadata fetch failed: %s", e)

    return _metadata_cache


# ---------------------------------------------------------------------------
# Label-clearing state — tracks previous label tuples for Gauge.remove()
# ---------------------------------------------------------------------------

_prev_dealer_info: set = set()
_prev_script_taxonomy: set = set()
_prev_commodity: set = set()
_prev_purity: set = set()
_prev_city: set = set()
_prev_weight: set = set()
_prev_form: set = set()


def _update_gauge(gauge, new_labels: set, prev_labels: set) -> set:
    """Set gauge=1 for new label tuples, remove stale ones. Returns new set."""
    for stale in prev_labels - new_labels:
        try:
            gauge.remove(*stale)
        except Exception:
            pass
    for labels in new_labels:
        gauge.labels(*labels).set(1)
    return new_labels


def _update_count_gauge(gauge, counts: Dict, prev_labels: set) -> set:
    """Set gauge to count values, remove stale label tuples. Returns new set."""
    new_labels = set()
    for labels_tuple, count in counts.items():
        gauge.labels(*labels_tuple).set(count)
        new_labels.add(labels_tuple)
    for stale in prev_labels - new_labels:
        try:
            gauge.remove(*stale)
        except Exception:
            pass
    return new_labels


# ---------------------------------------------------------------------------
# Main refresh function
# ---------------------------------------------------------------------------

async def refresh_taxonomy_metrics(current_rates: Dict, shared_redis) -> None:
    """Compute and export all dealer intelligence Prometheus metrics."""
    global _prev_dealer_info, _prev_script_taxonomy
    global _prev_commodity, _prev_purity, _prev_city, _prev_weight, _prev_form

    if not current_rates:
        return

    # 1. Get taxonomy (hits Redis cache if warm, ~60s TTL)
    from .rate_taxonomy import get_cached_taxonomy
    classified, summary = await get_cached_taxonomy(current_rates)
    if not classified:
        return

    # 2. Get dealer metadata (city/state, 10min module cache)
    metadata = await _fetch_dealer_metadata(shared_redis)

    # 3. Summary gauges (fixed label sets — no clearing needed)
    DEALER_TOTAL.set(len(DEALER_TYPE_MAP))

    type_counts = Counter(DEALER_TYPE_MAP.values())
    for scraper_type in ("vots", "winbull", "socketio", "custom"):
        DEALER_COUNT_BY_TYPE.labels(scraper_type=scraper_type).set(
            type_counts.get(scraper_type, 0)
        )

    # Cities from metadata
    cities = {m["city"] for m in metadata.values() if m.get("city")}
    DEALER_CITIES_TOTAL.set(len(cities))

    # Total scripts
    total_scripts = sum(len(items) for items in classified.values())
    DEALER_SCRIPTS_TOTAL.set(total_scripts)

    # 4. Aggregate taxonomy gauges
    commodity_counts: Dict[tuple, int] = {}
    purity_counts: Dict[tuple, int] = {}
    weight_counts: Dict[tuple, int] = {}
    form_counts: Dict[tuple, int] = {}
    city_dealers: Dict[str, set] = {}

    for dealer_id, items in classified.items():
        # Track dealer's city for the city breakdown
        dealer_city = metadata.get(dealer_id, {}).get("city", "")
        if dealer_city:
            city_dealers.setdefault(dealer_city, set()).add(dealer_id)

        for item in items:
            c = item.get("classification", {})

            commodity = c.get("commodity") or "Unknown"
            k = (commodity,)
            commodity_counts[k] = commodity_counts.get(k, 0) + 1

            purity = c.get("purity") or ""
            if purity:
                k = (commodity, purity)
                purity_counts[k] = purity_counts.get(k, 0) + 1

            weight = c.get("weight") or ""
            if weight:
                k = (weight,)
                weight_counts[k] = weight_counts.get(k, 0) + 1

            form = c.get("form") or ""
            if form:
                k = (form,)
                form_counts[k] = form_counts.get(k, 0) + 1

    _prev_commodity = _update_count_gauge(
        TAXONOMY_SCRIPTS_BY_COMMODITY, commodity_counts, _prev_commodity
    )
    _prev_purity = _update_count_gauge(
        TAXONOMY_SCRIPTS_BY_PURITY, purity_counts, _prev_purity
    )
    _prev_weight = _update_count_gauge(
        TAXONOMY_SCRIPTS_BY_WEIGHT, weight_counts, _prev_weight
    )
    _prev_form = _update_count_gauge(
        TAXONOMY_SCRIPTS_BY_FORM, form_counts, _prev_form
    )

    # Dealers by city
    city_count_tuples = {(city,): len(dealers) for city, dealers in city_dealers.items()}
    _prev_city = _update_count_gauge(
        TAXONOMY_DEALERS_BY_CITY, city_count_tuples, _prev_city
    )

    # 5. Per-dealer info gauge (value = script count)
    new_dealer_info: Dict[tuple, int] = {}
    for dealer_id, items in classified.items():
        meta = metadata.get(dealer_id, {})
        city = meta.get("city", "")
        state = meta.get("state", "")
        scraper_type = DEALER_TYPE_MAP.get(dealer_id, "unknown")
        t = (dealer_id, city, state, scraper_type)
        new_dealer_info[t] = len(items)

    _prev_dealer_info = _update_count_gauge(
        DEALER_INFO, new_dealer_info, _prev_dealer_info
    )

    # 6. Per-script taxonomy gauge
    new_script_taxonomy = set()
    for dealer_id, items in classified.items():
        dealer_city = metadata.get(dealer_id, {}).get("city", "")
        for item in items:
            c = item.get("classification", {})
            t = (
                dealer_id,
                (item.get("script_name") or "")[:80],
                c.get("commodity") or "",
                c.get("purity") or "",
                c.get("weight") or "",
                c.get("city") or dealer_city,
                c.get("form") or "",
                c.get("delivery") or "",
                c.get("gst") or "",
            )
            new_script_taxonomy.add(t)

    _prev_script_taxonomy = _update_gauge(
        DEALER_SCRIPT_TAXONOMY, new_script_taxonomy, _prev_script_taxonomy
    )
