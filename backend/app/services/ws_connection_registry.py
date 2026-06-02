"""
WebSocket connection registry — enforces per-user connection limits via Redis.

Uses sorted sets (ZSET) with last-heartbeat timestamps as scores for
self-cleaning behavior.  Each active connection refreshes its timestamp
every 30s from the WebSocket keep-alive loop.  On registration, entries
older than CONN_EXPIRY are pruned atomically before the limit check —
so pod restarts, OOM kills, and SIGKILL never leave permanent ghost
entries that block real users.

Migration: transparently handles old SET-type keys by deleting them
inside the Lua script on first access.
"""

import logging
import time
from uuid import uuid4

from app.database.connection import redis_manager

logger = logging.getLogger(__name__)

# ── Lua Scripts ──────────────────────────────────────────────────────────────

# REGISTER: atomically prune stale → check limit → add connection.
_LUA_REGISTER = """
local key       = KEYS[1]
local ws_id     = ARGV[1]
local max_conns = tonumber(ARGV[2])
local now       = tonumber(ARGV[3])
local expiry    = tonumber(ARGV[4])

-- Migration: if key is an old SET (pre-ZSET version), delete it
local ktype = redis.call('TYPE', key)
if ktype['ok'] == 'set' then
    redis.call('DEL', key)
end

-- Prune entries that haven't sent a heartbeat within the expiry window
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - expiry)

-- Check limit after pruning
local current = redis.call('ZCARD', key)
if current >= max_conns then
    return 0
end

-- Register this connection with current timestamp as score
redis.call('ZADD', key, now, ws_id)
-- Safety-net key expiry (3x member expiry) in case no one ever touches this key again
redis.call('EXPIRE', key, expiry * 3)
return 1
"""

# ── Constants ────────────────────────────────────────────────────────────────

# Seconds without heartbeat before an entry is considered stale and pruned.
# Active connections refresh every 30s, so 90s = 3 missed heartbeats.
CONN_EXPIRY = 90

# Max concurrent WebSocket connections per user.
# 3 allows phone + desktop + 1 spare for reconnects during deploys.
DEFAULT_MAX_CONNS = 3


class WSConnectionRegistry:
    """Tracks per-user WebSocket connections in Redis sorted sets."""

    _register_sha: str | None = None

    @classmethod
    async def _ensure_script(cls) -> str:
        """Load the register Lua script into Redis (cached via SHA)."""
        if cls._register_sha is None:
            cls._register_sha = await redis_manager.async_redis_client.script_load(
                _LUA_REGISTER
            )
        return cls._register_sha

    @classmethod
    async def register(
        cls,
        user_id: str,
        ws_id: str | None = None,
        max_conns: int = DEFAULT_MAX_CONNS,
    ) -> tuple[bool, str]:
        """Register a WebSocket connection for a user.

        The Lua script atomically prunes stale entries before checking the
        limit, so ghost entries from dead pods never block real users.

        Returns (allowed, ws_id).  If allowed=False, reject the connection.
        """
        if ws_id is None:
            ws_id = str(uuid4())

        key = f"ws:user:{user_id}:conns"
        now = time.time()

        try:
            sha = await cls._ensure_script()
            try:
                result = await redis_manager.async_redis_client.evalsha(
                    sha, 1, key, ws_id, str(max_conns), str(now), str(CONN_EXPIRY)
                )
            except Exception as e:
                if "NOSCRIPT" in str(e):
                    # Script evicted after Redis restart — reload and retry once
                    cls._register_sha = None
                    sha = await cls._ensure_script()
                    result = await redis_manager.async_redis_client.evalsha(
                        sha, 1, key, ws_id, str(max_conns), str(now), str(CONN_EXPIRY)
                    )
                else:
                    raise
            return (result == 1, ws_id)
        except Exception as e:
            logger.warning("WS registry register failed for %s: %s", user_id, e)
            return (True, ws_id)  # Fail-open: don't block user on Redis errors

    @classmethod
    async def refresh(cls, user_id: str, ws_id: str) -> None:
        """Refresh a connection's heartbeat timestamp to prevent expiry.

        Called every 30s from the WebSocket keep-alive loop.  Uses plain
        ZADD (not the Lua script) for minimal overhead.
        """
        key = f"ws:user:{user_id}:conns"
        try:
            # ZADD updates the member's score (heartbeat timestamp).
            # EXPIRE extends the key's safety-net TTL.  Both are needed:
            # without EXPIRE, connections living >270s see the key deleted
            # by Redis, and refresh() recreates it without a TTL — leaking
            # empty keys after disconnect.  The cost is 2 Redis commands
            # per connection per 30s, well within budget.
            r = redis_manager.async_redis_client
            await r.zadd(key, {ws_id: time.time()})
            await r.expire(key, CONN_EXPIRY * 3)
        except Exception as e:
            # Non-fatal: if refresh fails, the entry will expire and re-register
            logger.debug("WS registry refresh failed for %s: %s", user_id, e)

    @classmethod
    async def unregister(cls, user_id: str, ws_id: str) -> None:
        """Remove a WebSocket connection from the registry."""
        key = f"ws:user:{user_id}:conns"
        try:
            await redis_manager.async_redis_client.zrem(key, ws_id)
        except Exception as e:
            logger.warning("WS registry unregister failed for %s: %s", user_id, e)
