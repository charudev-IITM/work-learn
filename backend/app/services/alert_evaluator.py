"""
Alert evaluator — called synchronously from CachedRateService.handle_new_rates().
Performs threshold crossing detection and queues triggered alerts for delivery.
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from .alert_service import AlertService, CachedAlert

logger = logging.getLogger(__name__)

# Staleness threshold: suppress alerts when rate data is older than this
STALE_THRESHOLD_SECONDS = 300  # 5 minutes


class AlertEvaluator:
    def __init__(self):
        # (dealer, script, rate_type) -> previous rate value
        self._previous_rates: Dict[Tuple[str, str, str], float] = {}

    @staticmethod
    def _is_stale(rate_dict: Dict) -> bool:
        """Returns True if rate timestamp is more than 5 minutes old."""
        ts_raw = rate_dict.get("timestamp")
        if not ts_raw:
            return True
        try:
            if isinstance(ts_raw, str):
                ts = datetime.fromisoformat(ts_raw)
            else:
                ts = ts_raw
            return (datetime.utcnow() - ts).total_seconds() > STALE_THRESHOLD_SECONDS
        except Exception:
            return True

    @staticmethod
    def _check_crossing(
        alert: CachedAlert,
        current_rate: float,
        prev_rate: Optional[float],
    ) -> bool:
        """
        Returns True only if a threshold crossing event occurred.
        First observation (prev_rate=None) never triggers.
        """
        if prev_rate is None:
            return False

        if alert.condition == "above":
            return prev_rate < alert.threshold <= current_rate
        else:  # "below"
            return prev_rate > alert.threshold >= current_rate

    @staticmethod
    def _should_trigger(
        alert: CachedAlert,
        current_rate: float,
        prev_rate: Optional[float],
        now: datetime,
    ) -> bool:
        """Combines crossing detection with persistent re-fire and cooldown."""
        # Cooldown check
        if alert.last_triggered_at is not None:
            elapsed = (now - alert.last_triggered_at).total_seconds()
            if elapsed < alert.cooldown_minutes * 60:
                return False

        # Crossing check
        if AlertEvaluator._check_crossing(alert, current_rate, prev_rate):
            return True

        # Persistent mode: re-trigger after cooldown if rate is still on trigger side
        if alert.trigger_mode == "persistent" and alert.last_triggered_at is not None:
            if alert.condition == "above" and current_rate >= alert.threshold:
                return True
            if alert.condition == "below" and current_rate <= alert.threshold:
                return True

        return False

    def evaluate(
        self,
        dealer: str,
        rate_dicts: List[Dict],
        delivery_queue: "asyncio.Queue",
        alert_service: AlertService,
    ) -> None:
        """
        Evaluate alerts against incoming rates. Synchronous — no awaits.
        Puts AlertTriggerEvent onto delivery_queue via put_nowait().
        """
        # Import here to avoid circular imports
        from .alert_delivery import AlertTriggerEvent

        now = datetime.utcnow()

        try:
            for rate_dict in rate_dicts:
                if not rate_dict:
                    continue

                # Suppress stale rates
                if self._is_stale(rate_dict):
                    continue

                script = rate_dict.get("symbol") or rate_dict.get("script_name")
                if not script:
                    continue

                # Evaluate alerts for this (dealer, script) pair
                for alert in alert_service.get_alerts_for_target(dealer, script):
                    rate_key = f"{alert.rate_type}_rate"
                    current_rate = rate_dict.get(rate_key)
                    if current_rate is None:
                        continue

                    prev_key = (dealer, script, alert.rate_type)
                    prev_rate = self._previous_rates.get(prev_key)

                    if self._should_trigger(alert, current_rate, prev_rate, now):
                        event = AlertTriggerEvent(
                            alert_id=alert.id,
                            user_id=alert.user_id,
                            phone=alert.phone,
                            dealer_name=dealer,
                            script_name=script,
                            condition=alert.condition,
                            rate_type=alert.rate_type,
                            threshold=alert.threshold,
                            trigger_mode=alert.trigger_mode,
                            current_rate=current_rate,
                            triggered_at=now,
                        )
                        try:
                            delivery_queue.put_nowait(event)
                        except asyncio.QueueFull:
                            logger.warning("Alert delivery queue full, dropping trigger for %s", alert.id)

                # Always update previous rates for baseline tracking
                for rt in ("buy", "sell"):
                    rate_val = rate_dict.get(f"{rt}_rate")
                    if rate_val is not None:
                        self._previous_rates[(dealer, script, rt)] = rate_val

        except Exception as e:
            logger.error("Alert evaluation error for %s: %s", dealer, e)


# Global singleton
alert_evaluator = AlertEvaluator()
