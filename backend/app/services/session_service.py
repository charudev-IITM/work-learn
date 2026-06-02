"""
Session management service — Redis-primary with Postgres audit trail.

Responsibilities:
- Single active session per user (new login invalidates old)
- OTP brute-force protection (5 attempts per 10 min)
- Fail-open on Redis outage (prefer availability)
"""

import logging
from datetime import datetime
from typing import Optional
from uuid import uuid4

from app.database.connection import redis_manager, AsyncSessionLocal

logger = logging.getLogger(__name__)

# Redis TTLs
SESSION_TTL = 86400        # 24h — matches JWT expiry
OTP_ATTEMPT_WINDOW = 600   # 10 min
MAX_OTP_ATTEMPTS = 5
MAX_ADMIN_SESSIONS = 5     # concurrent sessions per admin user

# OTP send rate limits (prevent SMS wallet drain even with CAPTCHA bypass)
OTP_SEND_WINDOW = 600          # 10 min
MAX_OTP_SENDS_PER_PHONE = 3   # max sends per phone per window
MAX_OTP_SENDS_PER_IP = 10     # max sends per IP per window

# Per-IP OTP verify limit (prevent parallel-phone brute force)
MAX_OTP_VERIFY_PER_IP = 20    # ~4 phones legitimately, useless for brute force


class OTPRateLimitError(Exception):
    """Raised when OTP attempt limit is exceeded."""
    def __init__(self, remaining_seconds: int):
        self.remaining_seconds = remaining_seconds
        super().__init__(f"Too many OTP attempts. Try again in {remaining_seconds}s.")


class OTPSendRateLimitError(Exception):
    """Raised when OTP send rate limit is exceeded."""
    def __init__(self, remaining_seconds: int):
        self.remaining_seconds = remaining_seconds
        super().__init__(f"Too many OTP requests. Try again in {remaining_seconds}s.")


class SessionService:
    """Manages user sessions with Redis as primary store and Postgres for audit."""

    @staticmethod
    async def create_session(
        user_id: str,
        jti: str,
        ip: str,
        user_agent: str = "",
        device_hint: str = "Unknown",
    ) -> None:
        """Create a new session in Redis + Postgres audit."""
        # Redis: set active session (single jti per user)
        try:
            await redis_manager.set(f"session:{user_id}", jti, expire=SESSION_TTL)
        except Exception as e:
            logger.error(f"Redis session create failed for {user_id}: {e}")

        # Postgres: best-effort audit write
        try:
            async with AsyncSessionLocal() as session:
                from sqlalchemy import text
                await session.execute(
                    text("""
                        INSERT INTO user_sessions (id, user_id, jti, user_agent, ip_address, device_hint)
                        VALUES (:id, :user_id, :jti, :ua, :ip, :device)
                    """),
                    {
                        "id": str(uuid4()),
                        "user_id": user_id,
                        "jti": jti,
                        "ua": (user_agent or "")[:2000],
                        "ip": ip[:45] if ip else "",
                        "device": (device_hint or "Unknown")[:100],
                    },
                )
                await session.commit()
        except Exception as e:
            logger.warning(f"Session audit write failed for {user_id}: {e}")

    @staticmethod
    async def validate_session(user_id: str, jti: str) -> bool:
        """Check if jti matches the active session for this user.

        Fail-open: returns True if Redis is unreachable.
        """
        try:
            active_jti = await redis_manager.get(f"session:{user_id}")
            if active_jti is None:
                # No session in Redis — session was revoked or never created.
                # Deny: require re-authentication.
                return False
            return active_jti == jti
        except Exception as e:
            logger.error(f"Redis session validation failed for {user_id}: {e}")
            return True  # fail-open

    # ── Admin Multi-Session Support ───────────────────────────────

    @staticmethod
    async def create_admin_session(
        user_id: str,
        jti: str,
        ip: str,
        user_agent: str = "",
        device_hint: str = "Unknown",
    ) -> None:
        """Create an admin session in Redis hash (allows concurrent sessions)."""
        import time as _time
        key = f"sessions:admin:{user_id}"
        try:
            pipe = redis_manager.async_redis_client.pipeline()
            pipe.hset(key, jti, str(int(_time.time())))
            pipe.expire(key, SESSION_TTL)
            await pipe.execute()

            # Evict oldest sessions if over cap
            count = await redis_manager.async_redis_client.hlen(key)
            if count > MAX_ADMIN_SESSIONS:
                all_sessions = await redis_manager.async_redis_client.hgetall(key)
                sorted_jtis = sorted(all_sessions.items(), key=lambda x: int(x[1]))
                to_evict = sorted_jtis[:count - MAX_ADMIN_SESSIONS]
                if to_evict:
                    await redis_manager.async_redis_client.hdel(key, *(j for j, _ in to_evict))
        except Exception as e:
            logger.error(f"Redis admin session create failed for {user_id}: {e}")

        # Postgres audit trail (same as regular sessions)
        try:
            async with AsyncSessionLocal() as session:
                from sqlalchemy import text
                await session.execute(
                    text("""
                        INSERT INTO user_sessions (id, user_id, jti, user_agent, ip_address, device_hint)
                        VALUES (:id, :user_id, :jti, :ua, :ip, :device)
                    """),
                    {
                        "id": str(uuid4()),
                        "user_id": user_id,
                        "jti": jti,
                        "ua": (user_agent or "")[:2000],
                        "ip": ip[:45] if ip else "",
                        "device": (device_hint or "Unknown")[:100],
                    },
                )
                await session.commit()
        except Exception as e:
            logger.warning(f"Admin session audit write failed for {user_id}: {e}")

    @staticmethod
    async def validate_admin_session(user_id: str, jti: str) -> bool:
        """Check if jti exists in the admin sessions hash. Fail-open on Redis error."""
        try:
            exists = await redis_manager.async_redis_client.hexists(
                f"sessions:admin:{user_id}", jti
            )
            return bool(exists)
        except Exception as e:
            logger.error(f"Redis admin session validation failed for {user_id}: {e}")
            return True  # fail-open

    @staticmethod
    async def invalidate_session(
        user_id: str, jti: str, reason: str = "logout"
    ) -> None:
        """Remove a single admin session by jti."""
        try:
            await redis_manager.async_redis_client.hdel(
                f"sessions:admin:{user_id}", jti
            )
        except Exception as e:
            logger.warning(f"Redis admin session invalidation failed for {user_id}: {e}")

        # Postgres: revoke just this session
        try:
            async with AsyncSessionLocal() as session:
                from sqlalchemy import text
                await session.execute(
                    text("""
                        UPDATE user_sessions
                        SET revoked_at = now(), revoke_reason = :reason
                        WHERE user_id = :user_id AND jti = :jti AND revoked_at IS NULL
                    """),
                    {"user_id": user_id, "jti": jti, "reason": reason},
                )
                await session.commit()
        except Exception as e:
            logger.warning(f"Admin session revocation audit failed for {user_id}: {e}")

    # ── Session Invalidation ─────────────────────────────────────

    @staticmethod
    async def invalidate_all_sessions(
        user_id: str, reason: str = "new_login"
    ) -> Optional[str]:
        """Invalidate all sessions for a user. Returns displaced jti if any."""
        displaced_jti = None

        try:
            if redis_manager.async_redis_client:
                # Regular user session (single string key)
                displaced_jti = await redis_manager.async_redis_client.getdel(f"session:{user_id}")
                # Admin sessions hash (covers ban/force-logout)
                await redis_manager.async_redis_client.delete(f"sessions:admin:{user_id}")
        except Exception as e:
            logger.warning(f"Redis session invalidation failed for {user_id}: {e}")

        # Postgres: mark all active sessions as revoked
        try:
            async with AsyncSessionLocal() as session:
                from sqlalchemy import text
                await session.execute(
                    text("""
                        UPDATE user_sessions
                        SET revoked_at = now(), revoke_reason = :reason
                        WHERE user_id = :user_id AND revoked_at IS NULL
                    """),
                    {"user_id": user_id, "reason": reason},
                )
                await session.commit()
        except Exception as e:
            logger.warning(f"Session revocation audit failed for {user_id}: {e}")

        return displaced_jti

    # ── OTP Brute-Force Protection ─────────────────────────────

    @staticmethod
    async def check_and_record_otp_attempt(phone: str) -> int:
        """Atomically increment and check OTP attempt counter.

        Uses INCR-then-check to eliminate TOCTOU race conditions.
        Raises OTPRateLimitError if limit exceeded.
        Returns remaining attempts.
        """
        key = f"otp:attempts:{phone}"
        try:
            pipe = redis_manager.async_redis_client.pipeline()
            pipe.incr(key)
            pipe.expire(key, OTP_ATTEMPT_WINDOW)
            results = await pipe.execute()
            count = results[0]

            if count > MAX_OTP_ATTEMPTS:
                ttl = await redis_manager.async_redis_client.ttl(key)
                raise OTPRateLimitError(remaining_seconds=max(ttl, 0))

            return MAX_OTP_ATTEMPTS - count
        except OTPRateLimitError:
            raise
        except Exception as e:
            logger.warning(f"OTP attempt tracking failed for {phone}: {e}")
            return MAX_OTP_ATTEMPTS  # fail-open

    @staticmethod
    async def clear_otp_attempts(phone: str) -> None:
        """Clear OTP attempt counter after successful verification."""
        try:
            await redis_manager.delete(f"otp:attempts:{phone}")
        except Exception as e:
            logger.warning(f"OTP attempt clear failed for {phone}: {e}")

    # ── OTP Send Rate Limiting ─────────────────────────────────

    @staticmethod
    async def check_otp_send_limit(phone: str, client_ip: str) -> None:
        """Check per-phone and per-IP OTP send rate limits.

        Uses a single Redis pipeline for both counters.
        Raises OTPSendRateLimitError if either limit is exceeded.
        Fail-open on Redis error.
        """
        phone_key = f"otp:sends:{phone}"
        ip_key = f"otp:sends:ip:{client_ip}"
        try:
            pipe = redis_manager.async_redis_client.pipeline()
            pipe.incr(phone_key)
            pipe.expire(phone_key, OTP_SEND_WINDOW)
            pipe.incr(ip_key)
            pipe.expire(ip_key, OTP_SEND_WINDOW)
            results = await pipe.execute()
            phone_count = results[0]
            ip_count = results[2]

            if phone_count > MAX_OTP_SENDS_PER_PHONE:
                ttl = await redis_manager.async_redis_client.ttl(phone_key)
                raise OTPSendRateLimitError(remaining_seconds=max(ttl, 0))

            if ip_count > MAX_OTP_SENDS_PER_IP:
                ttl = await redis_manager.async_redis_client.ttl(ip_key)
                raise OTPSendRateLimitError(remaining_seconds=max(ttl, 0))

        except OTPSendRateLimitError:
            raise
        except Exception as e:
            logger.warning(f"OTP send rate limit check failed: {e}")
            # fail-open

    # ── Per-IP OTP Verify Rate Limiting ────────────────────────

    @staticmethod
    async def check_otp_verify_ip_limit(client_ip: str) -> None:
        """Check per-IP OTP verify rate limit (prevents parallel-phone brute force).

        Raises OTPRateLimitError if limit exceeded.
        Fail-open on Redis error.
        """
        key = f"otp:verify_ip:{client_ip}"
        try:
            pipe = redis_manager.async_redis_client.pipeline()
            pipe.incr(key)
            pipe.expire(key, OTP_ATTEMPT_WINDOW)
            results = await pipe.execute()
            count = results[0]

            if count > MAX_OTP_VERIFY_PER_IP:
                ttl = await redis_manager.async_redis_client.ttl(key)
                raise OTPRateLimitError(remaining_seconds=max(ttl, 0))

        except OTPRateLimitError:
            raise
        except Exception as e:
            logger.warning(f"OTP verify IP rate limit check failed: {e}")

