"""
Alert service — in-memory cache, CRUD, and trigger recording for price alerts.
"""

import asyncio
import logging
from dataclasses import dataclass
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select, and_

from ..database.connection import AsyncSessionLocal
from ..database.models import PriceAlert, User
from ..schemas.alerts import AlertCreate, AlertUpdate, AlertResponse

logger = logging.getLogger(__name__)


@dataclass
class CachedAlert:
    id: str
    user_id: str
    dealer_name: str
    script_name: str
    condition: str
    rate_type: str
    threshold: float
    trigger_mode: str
    cooldown_minutes: int
    last_triggered_at: Optional[datetime]
    phone: str  # Denormalized from User to avoid DB join on hot path

    @staticmethod
    def from_model(alert: PriceAlert, phone: str) -> "CachedAlert":
        return CachedAlert(
            id=alert.id,
            user_id=alert.user_id,
            dealer_name=alert.dealer_name,
            script_name=alert.script_name,
            condition=alert.condition,
            rate_type=alert.rate_type,
            threshold=alert.threshold,
            trigger_mode=alert.trigger_mode,
            cooldown_minutes=alert.cooldown_minutes,
            last_triggered_at=alert.last_triggered_at,
            phone=phone or "",
        )


class AlertService:
    """Manages price alerts with an in-memory cache for fast evaluation."""

    def __init__(self):
        self._alert_index: Dict[Tuple[str, str], List[CachedAlert]] = defaultdict(list)
        self._alert_by_id: Dict[str, CachedAlert] = {}
        self._lock = asyncio.Lock()

    def _remove_from_index(self, alert_id: str, key: Tuple[str, str]) -> None:
        """Remove an alert from the index by ID. Must be called under self._lock."""
        self._alert_by_id.pop(alert_id, None)
        alerts_list = self._alert_index.get(key)
        if alerts_list is not None:
            self._alert_index[key] = [a for a in alerts_list if a.id != alert_id]
            if not self._alert_index[key]:
                del self._alert_index[key]

    def _add_to_index(self, cached: CachedAlert) -> None:
        """Add an alert to the index. Must be called under self._lock."""
        key = (cached.dealer_name, cached.script_name)
        self._alert_index[key].append(cached)
        self._alert_by_id[cached.id] = cached

    async def load_active_alerts(self) -> None:
        """Load all active alerts into memory at startup. JOINs users for phone."""
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(PriceAlert, User.phone)
                    .join(User, PriceAlert.user_id == User.id)
                    .where(PriceAlert.is_active == True)
                )
                rows = result.all()

                async with self._lock:
                    self._alert_index.clear()
                    self._alert_by_id.clear()

                    for alert, phone in rows:
                        cached = CachedAlert.from_model(alert, phone)
                        self._add_to_index(cached)

                logger.info("Loaded %d active alerts into memory", len(self._alert_by_id))
        except Exception as e:
            logger.error("Failed to load active alerts: %s", e)

    def get_alerts_for_target(self, dealer: str, script: str) -> List[CachedAlert]:
        """O(1) lookup — returns a snapshot copy for safe iteration."""
        return list(self._alert_index.get((dealer, script), []))

    async def record_trigger(self, alert_id: str, triggered_at: datetime) -> None:
        """Record trigger timestamp in DB and update cache."""
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(PriceAlert).where(PriceAlert.id == alert_id)
                )
                alert = result.scalar_one_or_none()
                if alert:
                    alert.last_triggered_at = triggered_at
                    await session.commit()

            async with self._lock:
                cached = self._alert_by_id.get(alert_id)
                if cached:
                    cached.last_triggered_at = triggered_at
        except Exception as e:
            logger.error("Failed to record trigger for alert %s: %s", alert_id, e)

    async def deactivate_alert(self, alert_id: str) -> None:
        """Deactivate a one-shot alert after triggering."""
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(PriceAlert).where(PriceAlert.id == alert_id)
                )
                alert = result.scalar_one_or_none()
                if alert:
                    alert.is_active = False
                    await session.commit()

            async with self._lock:
                cached = self._alert_by_id.get(alert_id)
                if cached:
                    self._remove_from_index(alert_id, (cached.dealer_name, cached.script_name))
        except Exception as e:
            logger.error("Failed to deactivate alert %s: %s", alert_id, e)

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def get_alerts(self, user_id: str) -> List[AlertResponse]:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PriceAlert)
                .where(PriceAlert.user_id == user_id)
                .order_by(PriceAlert.created_at.desc())
            )
            alerts = result.scalars().all()
            return [AlertResponse.model_validate(a) for a in alerts]

    async def create_alert(self, user_id: str, data: AlertCreate) -> AlertResponse:
        async with AsyncSessionLocal() as session:
            # Get user phone for cache
            user_result = await session.execute(
                select(User.phone).where(User.id == user_id)
            )
            phone = user_result.scalar_one_or_none() or ""

            alert = PriceAlert(
                user_id=user_id,
                dealer_name=data.dealer_name,
                script_name=data.script_name,
                condition=data.condition.value,
                rate_type=data.rate_type.value,
                threshold=data.threshold,
                trigger_mode=data.trigger_mode.value,
                cooldown_minutes=data.cooldown_minutes,
            )
            session.add(alert)
            await session.commit()
            await session.refresh(alert)

            cached = CachedAlert.from_model(alert, phone)
            async with self._lock:
                self._add_to_index(cached)

            return AlertResponse.model_validate(alert)

    async def update_alert(self, user_id: str, alert_id: str, data: AlertUpdate) -> AlertResponse:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PriceAlert).where(
                    and_(PriceAlert.id == alert_id, PriceAlert.user_id == user_id)
                )
            )
            alert = result.scalar_one_or_none()
            if not alert:
                raise ValueError("Alert not found")

            if data.threshold is not None:
                alert.threshold = data.threshold
            if data.condition is not None:
                alert.condition = data.condition.value
            if data.rate_type is not None:
                alert.rate_type = data.rate_type.value
            if data.trigger_mode is not None:
                alert.trigger_mode = data.trigger_mode.value
            if data.cooldown_minutes is not None:
                alert.cooldown_minutes = data.cooldown_minutes
            if data.is_active is not None:
                alert.is_active = data.is_active

            alert.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(alert)

            # Fetch phone before acquiring lock (needed for re-activation)
            phone = ""
            cached = self._alert_by_id.get(alert_id)
            if not cached and alert.is_active:
                user_result = await session.execute(
                    select(User.phone).where(User.id == user_id)
                )
                phone = user_result.scalar_one_or_none() or ""

            async with self._lock:
                if cached and not alert.is_active:
                    self._remove_from_index(alert_id, (cached.dealer_name, cached.script_name))
                elif cached and alert.is_active:
                    cached.threshold = alert.threshold
                    cached.condition = alert.condition
                    cached.rate_type = alert.rate_type
                    cached.trigger_mode = alert.trigger_mode
                    cached.cooldown_minutes = alert.cooldown_minutes
                elif not cached and alert.is_active:
                    new_cached = CachedAlert.from_model(alert, phone)
                    self._add_to_index(new_cached)

            return AlertResponse.model_validate(alert)

    async def delete_alert(self, user_id: str, alert_id: str) -> None:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PriceAlert).where(
                    and_(PriceAlert.id == alert_id, PriceAlert.user_id == user_id)
                )
            )
            alert = result.scalar_one_or_none()
            if not alert:
                raise ValueError("Alert not found")

            await session.delete(alert)
            await session.commit()

        async with self._lock:
            cached = self._alert_by_id.get(alert_id)
            if cached:
                self._remove_from_index(alert_id, (cached.dealer_name, cached.script_name))


# Global singleton
alert_service = AlertService()
