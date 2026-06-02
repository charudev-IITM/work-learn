"""
Online history service — records online user count every minute into a Redis sorted set.

Redis key: metrics:online_history
Member format: "<unix_ts>:<count>" (e.g. "1742600460:14")
Score: float(unix_ts)

Retention: 7 days (pruned on every write).
"""

import logging
import time

from app.database.connection import redis_manager

logger = logging.getLogger(__name__)

REDIS_KEY = "metrics:online_history"
RETENTION_SECONDS = 7 * 24 * 3600  # 604800


async def record_sample(count: int) -> None:
    """Record a single online-count sample for the current minute."""
    ts = (int(time.time()) // 60) * 60  # truncate to minute boundary
    try:
        redis = redis_manager.async_redis_client
        pipe = redis.pipeline(transaction=False)
        # Remove any existing entry for this exact minute (handles restarts)
        pipe.zremrangebyscore(REDIS_KEY, ts, ts)
        # Add the new entry
        pipe.zadd(REDIS_KEY, {f"{ts}:{count}": float(ts)})
        # Prune entries older than 7 days
        pipe.zremrangebyscore(REDIS_KEY, 0, float(ts) - RETENTION_SECONDS)
        await pipe.execute()
    except Exception as e:
        logger.debug(f"Online history record failed: {e}")


async def get_samples(range_seconds: int) -> list:
    """Return [{t: int, v: int}, ...] for the given time range."""
    since = int(time.time()) - range_seconds
    try:
        redis = redis_manager.async_redis_client
        members = await redis.zrangebyscore(REDIS_KEY, min=since, max="+inf")
        results = []
        for m in members:
            raw = m.decode() if isinstance(m, bytes) else str(m)
            parts = raw.split(":", 1)
            if len(parts) == 2:
                try:
                    results.append({"t": int(parts[0]), "v": int(parts[1])})
                except ValueError:
                    continue
        return results
    except Exception as e:
        logger.debug(f"Online history fetch failed: {e}")
        return []
