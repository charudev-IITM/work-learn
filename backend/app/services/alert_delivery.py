"""
Alert delivery worker — consumes triggered alerts from queue and sends WhatsApp messages.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class AlertTriggerEvent:
    alert_id: str
    user_id: str
    phone: str
    dealer_name: str
    script_name: str
    condition: str  # "above" | "below"
    rate_type: str  # "buy" | "sell"
    threshold: float
    trigger_mode: str  # "one_shot" | "persistent"
    current_rate: float
    triggered_at: datetime


class AlertDeliveryWorker:
    def __init__(self):
        self.queue: asyncio.Queue[AlertTriggerEvent] = asyncio.Queue(maxsize=500)
        self._task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())
        logger.info("Alert delivery worker started")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Alert delivery worker stopped")

    async def _run(self) -> None:
        while True:
            event = await self.queue.get()
            try:
                await self._deliver(event)
            except Exception as e:
                logger.error("Alert delivery failed for %s: %s", event.alert_id, e)
            finally:
                self.queue.task_done()

    async def _deliver(self, event: AlertTriggerEvent) -> None:
        from .msg91_service import MSG91Service, MSG91Error
        from .alert_service import alert_service
        from ..database.connection import redis_manager

        # Deduplicate across workers — multiple gunicorn workers and pod
        # replicas all evaluate the same rate update independently.  Use a
        # Redis SET NX so only the first worker to claim this alert sends.
        dedup_key = f"alert_dedup:{event.alert_id}"
        try:
            if redis_manager.async_redis_client:
                claimed = await redis_manager.async_redis_client.set(
                    dedup_key, "1", nx=True, ex=60,
                )
                if not claimed:
                    logger.debug(
                        "Alert %s already claimed by another worker, skipping",
                        event.alert_id,
                    )
                    return
        except Exception as e:
            # If Redis is down, proceed anyway — duplicate send is better
            # than no send at all.
            logger.warning("Alert dedup Redis check failed: %s", e)

        # Normalize phone to E.164 before sending
        try:
            phone = MSG91Service.normalize_phone(event.phone)
        except MSG91Error:
            logger.error("Invalid phone for alert %s: %s", event.alert_id, event.phone)
            return

        condition_text = "reached above" if event.condition == "above" else "dropped below"

        template_vars = {
            "dealer_name": event.dealer_name,
            "script_name": event.script_name,
            "condition_text": condition_text,
            "current_rate": str(event.current_rate),
            "threshold": str(event.threshold),
            "rate_type": event.rate_type,
        }

        try:
            await MSG91Service.send_whatsapp(phone, template_vars)
            logger.info(
                "Alert delivered: %s %s %s %s (rate=%.2f, threshold=%.2f) -> %s",
                event.dealer_name, event.script_name, event.rate_type,
                event.condition, event.current_rate, event.threshold, event.phone,
            )

            # Record trigger
            await alert_service.record_trigger(event.alert_id, event.triggered_at)

            # Deactivate one-shot alerts
            if event.trigger_mode == "one_shot":
                await alert_service.deactivate_alert(event.alert_id)

        except MSG91Error as e:
            logger.error(
                "WhatsApp delivery failed for alert %s to %s: %s",
                event.alert_id, event.phone, e,
            )
            # Do NOT record trigger — alert will re-trigger after cooldown


# Global singleton
alert_delivery_worker = AlertDeliveryWorker()
