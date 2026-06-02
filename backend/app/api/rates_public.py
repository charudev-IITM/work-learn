"""
Public demo rate endpoint — limited, unauthenticated access for website live demo.

Returns only a configurable subset of dealers with sell_rate only.
Per-IP rate limited: 6 requests per minute.
"""

import os
import time
import logging

from fastapi import APIRouter, HTTPException, Request

from app.database.connection import redis_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["rates-public"])

# Configurable demo dealers (comma-separated env var)
_DEMO_DEALERS: list[str] | None = None
DEMO_RATE_LIMIT = 6  # requests per minute per IP
DEMO_RATE_WINDOW = 60  # seconds


def _get_demo_dealers() -> list[str]:
    global _DEMO_DEALERS
    if _DEMO_DEALERS is None:
        raw = os.getenv("DEMO_DEALERS", "")
        if raw:
            _DEMO_DEALERS = [d.strip() for d in raw.split(",") if d.strip()]
        else:
            _DEMO_DEALERS = []
    return _DEMO_DEALERS


@router.get("/api/rates/demo")
async def demo_rates(request: Request):
    """Public demo endpoint — limited dealers, sell_rate only, per-IP rate limited."""

    # ── Per-IP rate limit ──────────────────────────────────
    client_ip = getattr(request.state, "client_ip", None)
    if not client_ip:
        client_ip = request.client.host if request.client else "unknown"

    rate_key = f"demo:ratelimit:{client_ip}"
    try:
        pipe = redis_manager.async_redis_client.pipeline()
        pipe.incr(rate_key)
        pipe.expire(rate_key, DEMO_RATE_WINDOW)
        results = await pipe.execute()
        count = results[0]
        if count > DEMO_RATE_LIMIT:
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Try again in a minute.",
                headers={"Retry-After": str(DEMO_RATE_WINDOW)},
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.debug(f"Demo rate limit check failed: {e}")
        # Fail-open

    # ── Get rates from in-memory cache ─────────────────────
    from app.main import cached_rate_service

    all_rates = await cached_rate_service.get_current_rates()
    demo_dealers = _get_demo_dealers()

    result = {}
    dealers_included = 0
    max_dealers = 3

    for dealer_name, dealer_data in all_rates.items():
        # If DEMO_DEALERS is set, only include those
        if demo_dealers and dealer_name not in demo_dealers:
            continue

        if dealers_included >= max_dealers:
            break

        # Rate symbols are direct keys on dealer_data (not nested under "rates")
        # Filter to only dicts with sell_rate (skip metadata keys)
        filtered_rates = {}
        for symbol, rate_info in dealer_data.items():
            if not isinstance(rate_info, dict) or "sell_rate" not in rate_info:
                continue
            filtered_rates[symbol] = {
                "script_name": rate_info.get("script_name", symbol),
                "sell_rate": rate_info.get("sell_rate"),
                "timestamp": rate_info.get("timestamp", ""),
            }

        if not filtered_rates:
            continue

        result[dealer_name] = {"rates": filtered_rates}
        dealers_included += 1

    return result
