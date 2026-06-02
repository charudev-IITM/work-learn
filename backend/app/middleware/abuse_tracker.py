"""
AbuseTrackerMiddleware — per-user behavioral analysis and scoring.

Runs on /api/ paths only. Lightweight JWT decode (no DB hit) to extract user_id.
Tracks call frequency, detects bot patterns, and progressively warns.

Design principles:
- Signals are deduplicated per-window (fire once per 60s, not per-request)
- Auth endpoints are NEVER blocked (user must always be able to sign in/out)
- Rate-sensitive endpoints get throttled; others just get logged
- Production-only (no-op in dev/staging)
"""

import asyncio
import logging
import os
import re
import time
from statistics import stdev

import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.database.connection import redis_manager

logger = logging.getLogger(__name__)

# Atomic Lua script for signal dedup — eliminates race condition where
# concurrent requests all read empty state and each scores independently.
# Uses Redis HASH (HGET/HSET) instead of JSON GET/SET.
_DEDUP_LUA = """
local dedup_key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local fired = {}
for i = 3, #ARGV, 2 do
    local signal_name = ARGV[i]
    local weight = ARGV[i+1]
    local last = tonumber(redis.call('HGET', dedup_key, signal_name) or '0')
    if now - (last or 0) >= window then
        redis.call('HSET', dedup_key, signal_name, tostring(now))
        fired[#fired+1] = signal_name
        fired[#fired+1] = weight
    end
end
redis.call('EXPIRE', dedup_key, window * 2)
return fired
"""
_dedup_script = None  # Registered lazily

# Signal weights — kept moderate; dedup prevents runaway accumulation
SIGNAL_WEIGHTS = {
    "datacenter_ip": 15,
    "no_referer_on_rate_path": 5,
    "bot_user_agent": 20,
    "missing_cf_ray": 10,
    "high_frequency": 20,
    "regular_interval": 20,
}

# Bot UA patterns
_BOT_UA_PATTERN = re.compile(
    r"curl|wget|python-requests|httpx|go-http|scrapy|java/|libwww|httpclient",
    re.IGNORECASE,
)

# Rate-sensitive paths (blocking only applies here)
_RATE_PATHS = {"/api/rates/"}

# Paths that must NEVER be blocked (auth, health, demo)
_EXEMPT_PREFIXES = ("/api/auth/", "/api/rates/demo", "/health")

# Thresholds
WARN_SCORE = 100
BLOCK_SCORE = 500
HIGH_FREQ_THRESHOLD = 60  # calls per 60s (was 30 — too sensitive for SPA page loads)
SLIDING_WINDOW = 60  # seconds
INTERVAL_STDDEV_THRESHOLD = 500  # ms
SIGNAL_DEDUP_WINDOW = 60  # seconds — each signal fires at most once per window


class AbuseTrackerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # Production-only
        if os.getenv("ENVIRONMENT", "").lower() != "production":
            return await call_next(request)

        path = request.url.path

        # Only track /api/ paths
        if not path.startswith("/api/"):
            return await call_next(request)

        # Never block exempt paths (auth, demo, health)
        is_exempt = any(path.startswith(prefix) for prefix in _EXEMPT_PREFIXES)

        # ── Lightweight JWT decode to get user_id ───────────
        user_id = self._extract_user_id(request)
        if not user_id:
            return await call_next(request)

        # ── Check if already at block threshold ──────────────
        try:
            score_raw = await redis_manager.get(f"abuse:score:{user_id}")
            current_score = int(score_raw) if score_raw else 0
        except Exception:
            current_score = 0

        # Only block rate-sensitive endpoints, never exempt ones
        if current_score >= BLOCK_SCORE and not is_exempt:
            is_rate_path = any(path.startswith(rp) for rp in _RATE_PATHS)
            if is_rate_path:
                # Get exact TTL so user knows when the block lifts
                try:
                    ttl = await redis_manager.async_redis_client.ttl(f"abuse:score:{user_id}")
                    ttl = max(ttl, 0)
                except Exception:
                    ttl = 300
                remaining_min = max(1, ttl // 60)
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": f"Suspicious activity detected on your account. Please try again in {remaining_min} minutes.",
                        "code": "ABUSE_THROTTLE",
                        "retry_after": ttl,
                    },
                    headers={"Retry-After": str(ttl)},
                )
            # Non-rate, non-exempt paths: let through but log

        # ── Record call timestamp + fetch dedup state (single pipeline) ──
        now = time.time()
        now_ms = int(now * 1000)
        calls_key = f"abuse:calls:{user_id}"
        dedup_key = f"abuse:seen:{user_id}"

        try:
            pipe = redis_manager.async_redis_client.pipeline()
            pipe.zadd(calls_key, {str(now_ms): now})
            pipe.zremrangebyscore(calls_key, 0, now - SLIDING_WINDOW)
            pipe.expire(calls_key, SLIDING_WINDOW + 60)
            pipe.zrange(calls_key, 0, -1, withscores=True)
            results = await pipe.execute()
            call_entries = results[3]
        except Exception as e:
            logger.debug(f"Abuse tracking pipeline failed: {e}")
            return await call_next(request)

        call_count = len(call_entries)

        # ── Evaluate signals (deduped per window) ─────────────
        signals: list[tuple[str, int]] = []

        # Datacenter IP
        if getattr(request.state, "is_datacenter", False):
            signals.append(("datacenter_ip", SIGNAL_WEIGHTS["datacenter_ip"]))

        # No Referer on rate paths only
        if any(path.startswith(rp) for rp in _RATE_PATHS):
            if not request.headers.get("referer"):
                signals.append(("no_referer_on_rate_path", SIGNAL_WEIGHTS["no_referer_on_rate_path"]))

        # Bot UA
        ua = request.headers.get("user-agent", "")
        if _BOT_UA_PATTERN.search(ua):
            signals.append(("bot_user_agent", SIGNAL_WEIGHTS["bot_user_agent"]))

        # Missing CF-Ray (direct-to-origin bypass)
        if not getattr(request.state, "cf_ray", ""):
            signals.append(("missing_cf_ray", SIGNAL_WEIGHTS["missing_cf_ray"]))

        # High frequency
        if call_count > HIGH_FREQ_THRESHOLD:
            signals.append(("high_frequency", SIGNAL_WEIGHTS["high_frequency"]))

        # Regular interval detection (mechanical polling)
        if len(call_entries) >= 10:
            timestamps = sorted(float(score) for _, score in call_entries[-10:])
            intervals = [
                (timestamps[i + 1] - timestamps[i]) * 1000
                for i in range(len(timestamps) - 1)
            ]
            if len(intervals) >= 2:
                try:
                    sd = stdev(intervals)
                    if sd < INTERVAL_STDDEV_THRESHOLD:
                        signals.append(("regular_interval", SIGNAL_WEIGHTS["regular_interval"]))
                except Exception:
                    pass

        # ── Deduplicate signals per window (atomic Lua) ─────────
        # Each signal can only score once per SIGNAL_DEDUP_WINDOW.
        # Lua script runs atomically in Redis — no race between concurrent requests.
        if signals:
            try:
                global _dedup_script
                if _dedup_script is None:
                    _dedup_script = redis_manager.async_redis_client.register_script(_DEDUP_LUA)

                # Build ARGV: now, window, then pairs of (signal_name, weight)
                argv = [str(int(now)), str(SIGNAL_DEDUP_WINDOW)]
                for signal_name, weight in signals:
                    argv.extend([signal_name, str(weight)])

                fired = await _dedup_script(keys=[dedup_key], args=argv)

                # Lua returns flat list: [signal_name, weight, signal_name, weight, ...]
                deduped_signals: list[tuple[str, int]] = []
                if fired:
                    for i in range(0, len(fired), 2):
                        name = fired[i].decode() if isinstance(fired[i], bytes) else fired[i]
                        w = int(fired[i + 1].decode() if isinstance(fired[i + 1], bytes) else fired[i + 1])
                        deduped_signals.append((name, w))
                signals = deduped_signals
            except Exception as e:
                logger.debug(f"Dedup Lua failed, scoring all signals: {e}")
                # Fall through with all signals (fail-open)

        # ── Update score ───────────────────────────────────
        if signals:
            total_delta = sum(weight for _, weight in signals)
            try:
                pipe = redis_manager.async_redis_client.pipeline()
                pipe.incrby(f"abuse:score:{user_id}", total_delta)
                pipe.expire(f"abuse:score:{user_id}", 86400)
                results = await pipe.execute()
                new_score = results[0]
            except Exception:
                new_score = current_score + total_delta

            # Log to abuse_events (best-effort)
            if new_score >= WARN_SCORE:
                for signal_name, weight in signals:
                    self._log_abuse_event(
                        user_id=user_id,
                        client_ip=getattr(request.state, "client_ip", ""),
                        cf_country=getattr(request.state, "cf_country", ""),
                        is_dc=getattr(request.state, "is_datacenter", False),
                        provider=getattr(request.state, "dc_provider", ""),
                        signal=signal_name,
                        score_delta=weight,
                        total_score=new_score,
                        path=path,
                    )

            # ── Warning (WebSocket push, once per hour) ────
            if WARN_SCORE <= new_score < BLOCK_SCORE:
                await self._maybe_warn_user(user_id)

        return await call_next(request)

    def _extract_user_id(self, request: Request) -> str | None:
        """Lightweight JWT decode — no DB hit, no validation beyond structure."""
        token = None

        # Try cookie first
        token = request.cookies.get("auth_token")

        # Fallback to Authorization header
        if not token:
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]

        if not token:
            return None

        try:
            jwt_secret = os.getenv("JWT_SECRET", "")
            if not jwt_secret:
                return None
            payload = jwt.decode(token, jwt_secret, algorithms=["HS256"])
            return payload.get("user_id")
        except Exception:
            return None

    async def _maybe_warn_user(self, user_id: str) -> None:
        """Send WebSocket warning (once per hour)."""
        warned_key = f"abuse:warned:{user_id}"
        try:
            # SET NX with TTL — only sets if not already warned
            was_set = await redis_manager.async_redis_client.set(warned_key, "1", ex=3600, nx=True)
            if not was_set:
                return  # already warned within the hour

            # Send via websocket_manager
            from app.services.websocket_manager import websocket_manager
            await websocket_manager.send_to_user(
                user_id,
                {
                    "type": "security_warning",
                    "code": "ABNORMAL_USAGE_DETECTED",
                    "message": (
                        "Suspicious activity detected on your account. "
                        "If you're using automation tools, please contact support."
                    ),
                    "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                },
            )
        except Exception as e:
            logger.debug(f"Abuse warning send failed for {user_id}: {e}")

    def _log_abuse_event(
        self, *, user_id: str, client_ip: str, cf_country: str,
        is_dc: bool, provider: str, signal: str,
        score_delta: int, total_score: int, path: str,
    ) -> None:
        """Best-effort async write to abuse_events table."""
        async def _write():
            try:
                from app.database.connection import AsyncSessionLocal
                from sqlalchemy import text
                from uuid import uuid4

                async with AsyncSessionLocal() as session:
                    await session.execute(
                        text("""
                            INSERT INTO abuse_events
                                (id, user_id, client_ip, cf_country, is_datacenter, provider,
                                 signal, score_delta, total_score, path)
                            VALUES
                                (:id, :user_id, :client_ip, :cf_country, :is_dc, :provider,
                                 :signal, :score_delta, :total_score, :path)
                        """),
                        {
                            "id": str(uuid4()),
                            "user_id": user_id,
                            "client_ip": client_ip,
                            "cf_country": cf_country,
                            "is_dc": is_dc,
                            "provider": provider,
                            "signal": signal,
                            "score_delta": score_delta,
                            "total_score": total_score,
                            "path": path,
                        },
                    )
                    await session.commit()
            except Exception as e:
                logger.debug(f"Abuse event logging failed: {e}")

        try:
            asyncio.get_running_loop().create_task(_write())
        except RuntimeError:
            pass
