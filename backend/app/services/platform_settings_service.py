"""
Platform settings service — Redis-cached key-value feature flags.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, Dict

from sqlalchemy import select

from app.database.connection import AsyncSessionLocal, redis_manager
from app.database.models import PlatformSettings

logger = logging.getLogger(__name__)

SETTINGS_CACHE_TTL = 60  # seconds — admin changes take effect within 1 minute


class PlatformSettingsService:

    @staticmethod
    def _cache_key(key: str) -> str:
        return f"platform_settings:{key}"

    @staticmethod
    async def get(key: str) -> Optional[str]:
        """Get a setting value. Redis cache-first, DB fallback."""
        try:
            cached = await redis_manager.get(PlatformSettingsService._cache_key(key))
            if cached is not None:
                return cached
        except Exception:
            pass  # Redis down — fall through to DB

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PlatformSettings).filter_by(key=key)
            )
            row = result.scalar_one_or_none()

        value = row.value if row else None
        if value is not None:
            try:
                await redis_manager.set(
                    PlatformSettingsService._cache_key(key), value, SETTINGS_CACHE_TTL
                )
            except Exception:
                pass
        return value

    @staticmethod
    async def get_bool(key: str, default: bool = False) -> bool:
        val = await PlatformSettingsService.get(key)
        if val is None:
            return default
        return val.lower() == "true"

    @staticmethod
    async def get_int(key: str, default: int = 0) -> int:
        val = await PlatformSettingsService.get(key)
        if val is None:
            return default
        try:
            return int(val)
        except (ValueError, TypeError):
            return default

    @staticmethod
    async def set(key: str, value: str) -> None:
        """Set a setting value. Writes DB, overwrites Redis cache with new value."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PlatformSettings).filter_by(key=key)
            )
            row = result.scalar_one_or_none()
            if row:
                row.value = value
                row.updated_at = datetime.utcnow()
            else:
                session.add(PlatformSettings(key=key, value=value))
            await session.commit()

        # Overwrite (not just delete) to ensure stale keys with no TTL are replaced
        try:
            await redis_manager.set(
                PlatformSettingsService._cache_key(key), value, SETTINGS_CACHE_TTL
            )
        except Exception:
            # If overwrite fails, try to at least delete the stale key
            try:
                await redis_manager.delete(PlatformSettingsService._cache_key(key))
            except Exception:
                pass

    @staticmethod
    async def get_all() -> Dict[str, str]:
        """Get all settings as a dict."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(PlatformSettings))
            rows = result.scalars().all()
        return {row.key: row.value for row in rows}

    @staticmethod
    async def is_trial_promo_active() -> bool:
        """Check if the trial promo is currently within its scheduled window."""
        start_str, end_str = await asyncio.gather(
            PlatformSettingsService.get("trial_promo_start"),
            PlatformSettingsService.get("trial_promo_end"),
        )
        if not start_str or not end_str:
            return False
        try:
            start = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
            end = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            return start <= now <= end
        except (ValueError, TypeError):
            logger.warning(f"Invalid trial promo dates: start={start_str}, end={end_str}")
            return False

    @staticmethod
    async def get_trial_duration_days() -> int:
        return await PlatformSettingsService.get_int("trial_duration_days", default=7)
