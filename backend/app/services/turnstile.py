"""Cloudflare Turnstile server-side verification."""

import os
import logging
import aiohttp

logger = logging.getLogger(__name__)

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

# Shared session for connection reuse
_http_session: aiohttp.ClientSession | None = None


def _get_session() -> aiohttp.ClientSession:
    global _http_session
    if _http_session is None or _http_session.closed:
        _http_session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5))
    return _http_session


async def close_turnstile_session() -> None:
    global _http_session
    if _http_session and not _http_session.closed:
        await _http_session.close()
        _http_session = None


async def verify_turnstile(token: str) -> bool:
    """
    Verify a Cloudflare Turnstile token.
    Returns True if valid.
    Returns True if TURNSTILE_SECRET_KEY is not configured (dev mode).
    """
    secret = os.getenv("TURNSTILE_SECRET_KEY", "")
    if not secret:
        logger.warning("TURNSTILE_SECRET_KEY not set - skipping verification (dev mode)")
        return True

    if not token:
        return False

    try:
        session = _get_session()
        async with session.post(
            TURNSTILE_VERIFY_URL,
            data={"secret": secret, "response": token},
        ) as resp:
            data = await resp.json()

        if not data.get("success"):
            logger.warning(f"Turnstile failed: {data.get('error-codes', [])}")
            return False

        return True

    except Exception as e:
        logger.error(f"Turnstile verification error: {e}")
        return False
