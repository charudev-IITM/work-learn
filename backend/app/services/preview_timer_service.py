"""
Preview timer service: Redis-based 10-minute timer with pause/resume.

Key: preview:timer:{user_id}  TTL: 24h
Payload: {started_at, elapsed_seconds, paused, last_resumed_at}

Timer math:
  When running: total_elapsed = elapsed_seconds + (now - last_resumed_at)
  When paused:  total_elapsed = elapsed_seconds
  remaining = max(0, PREVIEW_DURATION - total_elapsed)
"""

import json
import logging
from datetime import datetime, timezone

from app.database.connection import redis_manager

logger = logging.getLogger(__name__)

TIMER_KEY_PREFIX = "preview:timer:"
SENTINEL_KEY_PREFIX = "preview:expired:"
TIMER_TTL = 86400  # 24 hours
SENTINEL_TTL = 3600  # 1 hour
PREVIEW_DURATION_SECONDS = 600  # 10 minutes


def _expired_status() -> 'TimerStatus':
    return TimerStatus(PREVIEW_DURATION_SECONDS, 0, False, True)


class TimerStatus:
    __slots__ = ("elapsed_seconds", "remaining_seconds", "paused", "expired")

    def __init__(self, elapsed_seconds: int, remaining_seconds: int, paused: bool, expired: bool):
        self.elapsed_seconds = elapsed_seconds
        self.remaining_seconds = remaining_seconds
        self.paused = paused
        self.expired = expired

    def to_dict(self):
        return {
            "elapsed_seconds": self.elapsed_seconds,
            "remaining_seconds": self.remaining_seconds,
            "paused": self.paused,
            "expired": self.expired,
        }


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _seconds_since(iso_str: str) -> float:
    return (datetime.now(timezone.utc) - datetime.fromisoformat(iso_str)).total_seconds()


def _build_status(data: dict) -> TimerStatus:
    """Pure computation — no I/O."""
    elapsed = data.get("elapsed_seconds", 0)
    paused = data.get("paused", False)

    if not paused and data.get("last_resumed_at"):
        total_elapsed = int(elapsed + _seconds_since(data["last_resumed_at"]))
    else:
        total_elapsed = int(elapsed)

    remaining = max(0, PREVIEW_DURATION_SECONDS - total_elapsed)
    return TimerStatus(
        elapsed_seconds=total_elapsed,
        remaining_seconds=remaining,
        paused=paused,
        expired=remaining <= 0,
    )


class PreviewTimerService:
    """Redis-only preview timer with pause/resume."""

    @staticmethod
    async def _check_previously_expired(user_id: str) -> bool:
        """Check if user previously had a timer that expired (Redis TTL gone).
        Uses sentinel cache to avoid repeated DB hits.
        Note: uses watchlist name "My Watchlist" as proxy — if user renames it,
        the heuristic fails. Acceptable because mark_complete() sets
        onboarding_complete=True, so renamed-watchlist users won't reach
        preview flow again."""
        sentinel_key = f"{SENTINEL_KEY_PREFIX}{user_id}"
        cached = await redis_manager.get(sentinel_key)
        if cached is not None:
            return cached == "1"

        from app.services.watchlist_service import WatchlistService
        try:
            had_preview = await WatchlistService.has_watchlist_by_name(user_id, "My Watchlist")
        except Exception:
            logger.warning(f"DB error in _check_previously_expired for {user_id}, failing closed")
            return True  # Fail closed — assume expired on DB error
        if had_preview:
            await redis_manager.set(sentinel_key, "1", SENTINEL_TTL)
            return True
        # Negative sentinel — avoids repeated DB queries for new users
        await redis_manager.set(sentinel_key, "0", 300)
        return False

    @staticmethod
    async def start(user_id: str) -> TimerStatus:
        """Start timer. Idempotent — uses SET NX to avoid TOCTOU race."""
        key = f"{TIMER_KEY_PREFIX}{user_id}"
        now = _now_iso()
        payload = {
            "started_at": now,
            "elapsed_seconds": 0,
            "paused": False,
            "last_resumed_at": now,
        }
        # SET NX: only writes if key doesn't exist — atomic idempotency
        client = redis_manager.async_redis_client
        if not client:
            logger.warning(f"Redis client unavailable for preview timer start (user {user_id})")
            return TimerStatus(0, PREVIEW_DURATION_SECONDS, False, False)
        created = await client.set(key, json.dumps(payload, default=str), ex=TIMER_TTL, nx=True)
        if not created:
            return await PreviewTimerService.get_status(user_id)

        return TimerStatus(
            elapsed_seconds=0,
            remaining_seconds=PREVIEW_DURATION_SECONDS,
            paused=False,
            expired=False,
        )

    @staticmethod
    async def pause(user_id: str) -> TimerStatus:
        """Pause timer. Accumulates elapsed time."""
        key = f"{TIMER_KEY_PREFIX}{user_id}"
        data = await redis_manager.get_json(key)
        if not data:
            # No key — check if timer previously existed (TTL expired = expired)
            if await PreviewTimerService._check_previously_expired(user_id):
                return _expired_status()
            return TimerStatus(0, PREVIEW_DURATION_SECONDS, True, False)

        if data.get("paused"):
            return _build_status(data)

        # Accumulate time since last resume
        last_resumed = data.get("last_resumed_at")
        additional = _seconds_since(last_resumed) if last_resumed else 0
        data["elapsed_seconds"] = int(data.get("elapsed_seconds", 0) + additional)
        data["paused"] = True
        data["last_resumed_at"] = None

        await redis_manager.set_json(key, data, TIMER_TTL)
        return _build_status(data)

    @staticmethod
    async def resume(user_id: str) -> TimerStatus:
        """Resume timer. Idempotent — no-op if already running."""
        key = f"{TIMER_KEY_PREFIX}{user_id}"
        data = await redis_manager.get_json(key)
        if not data:
            # No key — check if timer previously existed (TTL expired = expired)
            if await PreviewTimerService._check_previously_expired(user_id):
                return _expired_status()
            return await PreviewTimerService.start(user_id)

        if not data.get("paused"):
            return _build_status(data)

        # Check if already expired
        elapsed = data.get("elapsed_seconds", 0)
        if elapsed >= PREVIEW_DURATION_SECONDS:
            return _expired_status()

        data["paused"] = False
        data["last_resumed_at"] = _now_iso()

        await redis_manager.set_json(key, data, TIMER_TTL)
        return _build_status(data)

    @staticmethod
    async def get_status(user_id: str) -> TimerStatus:
        """Get current timer status."""
        data = await redis_manager.get_json(f"{TIMER_KEY_PREFIX}{user_id}")
        if not data:
            # No key — check if timer previously existed (TTL expired = expired)
            if await PreviewTimerService._check_previously_expired(user_id):
                return _expired_status()
            return TimerStatus(0, PREVIEW_DURATION_SECONDS, False, False)
        return _build_status(data)

    @staticmethod
    async def is_expired(user_id: str) -> bool:
        """Check if preview timer has expired."""
        data = await redis_manager.get_json(f"{TIMER_KEY_PREFIX}{user_id}")
        if not data:
            return await PreviewTimerService._check_previously_expired(user_id)
        return _build_status(data).expired

    @staticmethod
    async def delete(user_id: str):
        """Delete timer key + sentinel (cleanup)."""
        try:
            await redis_manager.delete(f"{TIMER_KEY_PREFIX}{user_id}")
            await redis_manager.delete(f"{SENTINEL_KEY_PREFIX}{user_id}")
        except Exception as e:
            logger.warning(f"Failed to delete preview timer keys for user {user_id}: {e}")
