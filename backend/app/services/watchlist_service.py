"""
Watchlist service layer - Async version using asyncpg + async SQLAlchemy.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid

from sqlalchemy import select, and_, desc, func, delete
from sqlalchemy.orm import selectinload

from ..database.connection import AsyncSessionLocal
from ..database.models import User, UserWatchlist, UserWatchlistScript, UserSettings
from ..schemas.watchlist import (
    WatchlistCreate, WatchlistUpdate, WatchlistScriptCreate, WatchlistScriptUpdate,
    UserSettingsUpdate, ScriptReorderRequest,
    WatchlistResponse, WatchlistScriptResponse, UserSettingsResponse
)

logger = logging.getLogger(__name__)


class WatchlistService:
    """Async service for managing user watchlists"""

    MAX_WATCHLISTS = 5
    MAX_SCRIPTS_PER_WATCHLIST = 50

    @staticmethod
    def _generate_watchlist_id() -> str:
        return f"watchlist-{int(datetime.utcnow().timestamp())}-{str(uuid.uuid4())[:8]}"

    @staticmethod
    def _generate_script_id(dealer_name: str, script_name: str) -> str:
        timestamp = int(datetime.utcnow().timestamp())
        return f"{dealer_name}-{script_name}-{timestamp}-{str(uuid.uuid4())[:6]}"

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    async def has_watchlist_by_name(user_id: str, name: str) -> bool:
        """Check if a user has a watchlist with the given name.
        Raises on DB errors — callers must handle failure mode."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(UserWatchlist.id).where(
                    UserWatchlist.user_id == user_id,
                    UserWatchlist.name == name,
                ).limit(1)
            )
            return result.scalar_one_or_none() is not None

    @staticmethod
    async def _get_watchlist_or_raise(session, user_id: str, watchlist_id: str) -> UserWatchlist:
        result = await session.execute(
            select(UserWatchlist).where(
                and_(UserWatchlist.id == watchlist_id, UserWatchlist.user_id == user_id)
            )
        )
        watchlist = result.scalar_one_or_none()
        if not watchlist:
            raise ValueError("Watchlist not found")
        return watchlist

    @staticmethod
    async def _ensure_user_settings(session, user_id: str) -> UserSettings:
        result = await session.execute(
            select(UserSettings).filter_by(user_id=user_id)
        )
        settings = result.scalar_one_or_none()
        if not settings:
            settings = UserSettings(
                user_id=user_id,
                view_mode='sell',
                sort_mode='rate-desc',
                difference_type='buy'
            )
            session.add(settings)
            await session.flush()
        return settings

    @staticmethod
    async def _create_default_watchlists(session, user_id: str) -> List[UserWatchlist]:
        result = await session.execute(
            select(func.count()).select_from(UserWatchlist).filter_by(user_id=user_id)
        )
        if result.scalar() > 0:
            return []

        watchlists = []
        for i in range(1, 6):
            watchlist = UserWatchlist(
                id=WatchlistService._generate_watchlist_id(),
                user_id=user_id,
                name=f"Watchlist {i}",
                order_index=i - 1
            )
            session.add(watchlist)
            watchlists.append(watchlist)

        await session.flush()
        logger.info(f"Created 5 default watchlists for user {user_id}")
        return watchlists

    # ------------------------------------------------------------------
    # Public API (all async)
    # ------------------------------------------------------------------

    async def get_user_watchlists(self, user_id: str) -> Dict[str, Any]:
        try:
            async with AsyncSessionLocal() as session:
                # Load watchlists with scripts eagerly
                result = await session.execute(
                    select(UserWatchlist)
                    .options(selectinload(UserWatchlist.scripts))
                    .filter_by(user_id=user_id)
                    .order_by(UserWatchlist.order_index)
                )
                watchlists = list(result.scalars().unique().all())

                settings = await self._ensure_user_settings(session, user_id)

                if not watchlists:
                    watchlists = await self._create_default_watchlists(session, user_id)
                    if watchlists:
                        settings.current_watchlist_id = watchlists[0].id
                        await session.commit()
                    else:
                        # Retry
                        result = await session.execute(
                            select(UserWatchlist)
                            .options(selectinload(UserWatchlist.scripts))
                            .filter_by(user_id=user_id)
                            .order_by(UserWatchlist.order_index)
                        )
                        watchlists = list(result.scalars().unique().all())

                return {
                    "watchlists": [WatchlistResponse.model_validate(w) for w in watchlists],
                    "settings": UserSettingsResponse.model_validate(settings)
                }
        except Exception as e:
            logger.error(f"Error in get_user_watchlists for user {user_id}: {type(e).__name__}: {e}")
            raise

    async def create_watchlist(self, user_id: str, watchlist_data: WatchlistCreate) -> WatchlistResponse:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(func.count()).select_from(UserWatchlist).filter_by(user_id=user_id)
            )
            if result.scalar() >= self.MAX_WATCHLISTS:
                raise ValueError(f"Maximum {self.MAX_WATCHLISTS} watchlists allowed per user")

            result = await session.execute(
                select(UserWatchlist.order_index)
                .filter_by(user_id=user_id)
                .order_by(desc(UserWatchlist.order_index))
                .limit(1)
            )
            max_order = result.scalar_one_or_none()
            next_order = (max_order + 1) if max_order is not None else 0

            watchlist = UserWatchlist(
                id=self._generate_watchlist_id(),
                user_id=user_id,
                name=watchlist_data.name,
                order_index=next_order
            )
            session.add(watchlist)
            await session.commit()
            await session.refresh(watchlist, ['scripts'])
            return WatchlistResponse.model_validate(watchlist)

    async def update_watchlist(self, user_id: str, watchlist_id: str,
                               update_data: WatchlistUpdate) -> WatchlistResponse:
        async with AsyncSessionLocal() as session:
            watchlist = await self._get_watchlist_or_raise(session, user_id, watchlist_id)
            if update_data.name is not None:
                watchlist.name = update_data.name
            watchlist.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(watchlist, ['scripts'])
            return WatchlistResponse.model_validate(watchlist)

    async def delete_watchlist(self, user_id: str, watchlist_id: str) -> bool:
        async with AsyncSessionLocal() as session:
            watchlist = await self._get_watchlist_or_raise(session, user_id, watchlist_id)

            result = await session.execute(
                select(func.count()).select_from(UserWatchlist).filter_by(user_id=user_id)
            )
            if result.scalar() <= 1:
                raise ValueError("Cannot delete the last watchlist")

            result = await session.execute(
                select(UserSettings).filter_by(user_id=user_id)
            )
            settings = result.scalar_one_or_none()
            if settings and settings.current_watchlist_id == watchlist_id:
                result = await session.execute(
                    select(UserWatchlist).where(
                        and_(UserWatchlist.user_id == user_id, UserWatchlist.id != watchlist_id)
                    ).order_by(UserWatchlist.order_index).limit(1)
                )
                next_wl = result.scalar_one_or_none()
                settings.current_watchlist_id = next_wl.id if next_wl else None

            await session.delete(watchlist)
            await session.commit()
            return True

    async def add_script_to_watchlist(self, user_id: str, watchlist_id: str,
                                      script_data: WatchlistScriptCreate) -> WatchlistScriptResponse:
        async with AsyncSessionLocal() as session:
            await self._get_watchlist_or_raise(session, user_id, watchlist_id)

            result = await session.execute(
                select(func.count()).select_from(UserWatchlistScript).filter_by(watchlist_id=watchlist_id)
            )
            if result.scalar() >= self.MAX_SCRIPTS_PER_WATCHLIST:
                raise ValueError(f"Maximum {self.MAX_SCRIPTS_PER_WATCHLIST} scripts allowed per watchlist")

            result = await session.execute(
                select(UserWatchlistScript).where(
                    and_(
                        UserWatchlistScript.watchlist_id == watchlist_id,
                        UserWatchlistScript.dealer_name == script_data.dealer_name,
                        UserWatchlistScript.script_name == script_data.script_name
                    )
                )
            )
            if result.scalar_one_or_none():
                raise ValueError("Script already exists in this watchlist")

            result = await session.execute(
                select(UserWatchlistScript.order_index)
                .filter_by(watchlist_id=watchlist_id)
                .order_by(desc(UserWatchlistScript.order_index))
                .limit(1)
            )
            max_order = result.scalar_one_or_none()
            next_order = (max_order + 1) if max_order is not None else 0

            script = UserWatchlistScript(
                id=self._generate_script_id(script_data.dealer_name, script_data.script_name),
                watchlist_id=watchlist_id,
                dealer_name=script_data.dealer_name,
                script_name=script_data.script_name,
                script_display_name=script_data.script_display_name,
                product_type=script_data.product_type,
                multiplier=script_data.multiplier or 1.0,
                order_index=next_order,
                original_buy_rate=script_data.original_buy_rate,
                original_sell_rate=script_data.original_sell_rate,
                original_rates_timestamp=script_data.original_rates_timestamp
            )
            session.add(script)
            await session.commit()
            await session.refresh(script)
            return WatchlistScriptResponse.model_validate(script)

    async def remove_script_from_watchlist(self, user_id: str, watchlist_id: str,
                                           script_id: str) -> bool:
        async with AsyncSessionLocal() as session:
            await self._get_watchlist_or_raise(session, user_id, watchlist_id)

            result = await session.execute(
                select(UserWatchlistScript).where(
                    and_(UserWatchlistScript.id == script_id,
                         UserWatchlistScript.watchlist_id == watchlist_id)
                )
            )
            script = result.scalar_one_or_none()
            if not script:
                raise ValueError("Script not found in watchlist")

            result = await session.execute(
                select(UserSettings).filter_by(user_id=user_id)
            )
            settings = result.scalar_one_or_none()
            if settings and settings.reference_script_id == script_id:
                settings.reference_script_id = None

            await session.delete(script)
            await session.commit()
            return True

    async def add_scripts_bulk(self, user_id: str, watchlist_id: str,
                               scripts_data: list) -> list:
        """Add multiple scripts in a single transaction."""
        async with AsyncSessionLocal() as session:
            await self._get_watchlist_or_raise(session, user_id, watchlist_id)

            # Get current count and max order in one pass
            count_result = await session.execute(
                select(func.count()).select_from(UserWatchlistScript).filter_by(watchlist_id=watchlist_id)
            )
            current_count = count_result.scalar()

            order_result = await session.execute(
                select(UserWatchlistScript.order_index)
                .filter_by(watchlist_id=watchlist_id)
                .order_by(desc(UserWatchlistScript.order_index))
                .limit(1)
            )
            max_order = order_result.scalar_one_or_none()
            next_order = (max_order + 1) if max_order is not None else 0

            results = []
            for script_data in scripts_data:
                if current_count >= self.MAX_SCRIPTS_PER_WATCHLIST:
                    break
                # Check duplicate
                dup = await session.execute(
                    select(UserWatchlistScript).where(
                        and_(
                            UserWatchlistScript.watchlist_id == watchlist_id,
                            UserWatchlistScript.dealer_name == script_data.dealer_name,
                            UserWatchlistScript.script_name == script_data.script_name
                        )
                    )
                )
                if dup.scalar_one_or_none():
                    continue

                script = UserWatchlistScript(
                    id=self._generate_script_id(script_data.dealer_name, script_data.script_name),
                    watchlist_id=watchlist_id,
                    dealer_name=script_data.dealer_name,
                    script_name=script_data.script_name,
                    script_display_name=script_data.script_display_name,
                    product_type=script_data.product_type,
                    multiplier=script_data.multiplier or 1.0,
                    order_index=next_order,
                    original_buy_rate=script_data.original_buy_rate,
                    original_sell_rate=script_data.original_sell_rate,
                    original_rates_timestamp=script_data.original_rates_timestamp
                )
                session.add(script)
                results.append(script)
                next_order += 1
                current_count += 1

            await session.commit()
            for s in results:
                await session.refresh(s)
            return [WatchlistScriptResponse.model_validate(s) for s in results]

    async def remove_scripts_bulk(self, user_id: str, watchlist_id: str,
                                   script_ids: list) -> None:
        """Remove multiple scripts in a single transaction."""
        async with AsyncSessionLocal() as session:
            await self._get_watchlist_or_raise(session, user_id, watchlist_id)

            # Clear reference script if it's being removed
            settings_result = await session.execute(
                select(UserSettings).filter_by(user_id=user_id)
            )
            settings = settings_result.scalar_one_or_none()

            for script_id in script_ids:
                result = await session.execute(
                    select(UserWatchlistScript).where(
                        and_(UserWatchlistScript.id == script_id,
                             UserWatchlistScript.watchlist_id == watchlist_id)
                    )
                )
                script = result.scalar_one_or_none()
                if script:
                    if settings and settings.reference_script_id == script_id:
                        settings.reference_script_id = None
                    await session.delete(script)

            await session.commit()

    async def update_script_multiplier(self, user_id: str, watchlist_id: str,
                                       script_id: str, multiplier: float) -> WatchlistScriptResponse:
        async with AsyncSessionLocal() as session:
            await self._get_watchlist_or_raise(session, user_id, watchlist_id)

            result = await session.execute(
                select(UserWatchlistScript).where(
                    and_(UserWatchlistScript.id == script_id,
                         UserWatchlistScript.watchlist_id == watchlist_id)
                )
            )
            script = result.scalar_one_or_none()
            if not script:
                raise ValueError("Script not found in watchlist")

            script.multiplier = multiplier
            await session.commit()
            await session.refresh(script)
            return WatchlistScriptResponse.model_validate(script)

    async def reorder_scripts(self, user_id: str, watchlist_id: str,
                              reorder_data: ScriptReorderRequest) -> List[WatchlistScriptResponse]:
        async with AsyncSessionLocal() as session:
            await self._get_watchlist_or_raise(session, user_id, watchlist_id)

            result = await session.execute(
                select(UserWatchlistScript).filter_by(watchlist_id=watchlist_id)
            )
            scripts = list(result.scalars().all())
            script_dict = {s.id: s for s in scripts}

            for script_id in reorder_data.script_ids:
                if script_id not in script_dict:
                    raise ValueError(f"Script {script_id} not found in watchlist")

            for new_index, script_id in enumerate(reorder_data.script_ids):
                script_dict[script_id].order_index = new_index

            await session.commit()

            reordered = [script_dict[sid] for sid in reorder_data.script_ids]
            return [WatchlistScriptResponse.model_validate(s) for s in reordered]

    async def update_user_settings(self, user_id: str,
                                   settings_data: UserSettingsUpdate) -> UserSettingsResponse:
        async with AsyncSessionLocal() as session:
            settings = await self._ensure_user_settings(session, user_id)

            if settings_data.current_watchlist_id is not None:
                if settings_data.current_watchlist_id:
                    result = await session.execute(
                        select(UserWatchlist).where(
                            and_(
                                UserWatchlist.id == settings_data.current_watchlist_id,
                                UserWatchlist.user_id == user_id
                            )
                        )
                    )
                    if result.scalar_one_or_none() is None:
                        raise ValueError("Invalid current watchlist ID")
                settings.current_watchlist_id = settings_data.current_watchlist_id

            if settings_data.view_mode is not None:
                settings.view_mode = settings_data.view_mode
                if settings_data.view_mode != 'differences':
                    settings.reference_script_id = None

            if settings_data.sort_mode is not None:
                settings.sort_mode = settings_data.sort_mode

            if settings_data.reference_script_id is not None:
                if settings_data.reference_script_id:
                    result = await session.execute(
                        select(UserWatchlistScript)
                        .join(UserWatchlist)
                        .where(
                            and_(
                                UserWatchlistScript.id == settings_data.reference_script_id,
                                UserWatchlist.user_id == user_id
                            )
                        )
                    )
                    if result.scalar_one_or_none() is None:
                        raise ValueError("Invalid reference script ID")
                settings.reference_script_id = settings_data.reference_script_id

            if settings_data.difference_type is not None:
                settings.difference_type = settings_data.difference_type

            if settings_data.layout_mode is not None:
                settings.layout_mode = settings_data.layout_mode

            if settings_data.city_filter is not None:
                # Empty string clears the filter (show all cities)
                settings.city_filter = settings_data.city_filter or None

            settings.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(settings)
            return UserSettingsResponse.model_validate(settings)


# Global service instance
watchlist_service = WatchlistService()
