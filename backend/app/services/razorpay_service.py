"""
Razorpay API integration service.
Wraps all external Razorpay API calls. No business logic — pure API client.
"""

import os
import hmac
import hashlib
import logging
import asyncio
from typing import Optional, Dict, Any

import razorpay

logger = logging.getLogger(__name__)

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET")

# Plan pricing in paise (1 INR = 100 paise), GST-inclusive (18% IGST, SAC 998315)
PLANS = {
    "monthly": {
        "period": "monthly",
        "interval": 1,
        "item": {
            "name": "SpotCompare Monthly",
            "amount": 117900,  # Rs 1,179 (Rs 999 + 18% GST)
            "currency": "INR",
            "description": "Monthly access to SpotCompare bullion intelligence",
        },
        "notes": {"plan_type": "monthly"},
    },
    "annual": {
        "period": "yearly",
        "interval": 1,
        "item": {
            "name": "SpotCompare Annual",
            "amount": 1179900,  # Rs 11,799 (Rs 9,999 + 18% GST)
            "currency": "INR",
            "description": "Annual access to SpotCompare (2 months free)",
        },
        "notes": {"plan_type": "annual"},
    },
}


class RazorpayError(Exception):
    pass


class RazorpayService:
    _client: Optional[razorpay.Client] = None
    _plan_ids: Dict[str, str] = {}  # {"monthly": "plan_xxx", "annual": "plan_yyy"}

    @classmethod
    def _get_client(cls) -> razorpay.Client:
        if cls._client is None:
            if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
                raise RazorpayError("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set")
            cls._client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
        return cls._client

    @classmethod
    async def ensure_plans_exist(cls) -> Dict[str, str]:
        """
        Called once at startup. Creates plans if they don't exist.
        Returns {"monthly": plan_id, "annual": plan_id}.
        Env vars RAZORPAY_PLAN_ID_MONTHLY / RAZORPAY_PLAN_ID_ANNUAL short-circuit creation.
        """
        loop = asyncio.get_running_loop()

        monthly_id = os.getenv("RAZORPAY_PLAN_ID_MONTHLY")
        annual_id = os.getenv("RAZORPAY_PLAN_ID_ANNUAL")

        if monthly_id and annual_id:
            cls._plan_ids = {"monthly": monthly_id, "annual": annual_id}
            logger.info("Razorpay plans loaded from env vars")
            return cls._plan_ids

        client = cls._get_client()

        for plan_key, plan_data in PLANS.items():
            env_key = f"RAZORPAY_PLAN_ID_{plan_key.upper()}"
            existing_id = os.getenv(env_key)
            if existing_id:
                cls._plan_ids[plan_key] = existing_id
                continue
            try:
                plan = await loop.run_in_executor(None, client.plan.create, plan_data)
                cls._plan_ids[plan_key] = plan["id"]
                logger.info(f"Created Razorpay plan '{plan_key}': {plan['id']}")
                logger.warning(f"Set env var {env_key}={plan['id']} to avoid recreation on restart")
            except Exception as e:
                raise RazorpayError(f"Failed to create plan '{plan_key}': {e}")

        return cls._plan_ids

    @classmethod
    def get_plan_id(cls, plan_type: str) -> str:
        if plan_type not in cls._plan_ids:
            raise RazorpayError(f"Plan '{plan_type}' not initialized. Call ensure_plans_exist() first.")
        return cls._plan_ids[plan_type]

    @classmethod
    async def create_subscription(
        cls,
        plan_type: str,
        user_phone: Optional[str] = None,
        user_name: Optional[str] = None,
        start_at: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Creates a Razorpay subscription for a user. Returns full subscription object.
        start_at: optional Unix timestamp to defer first billing cycle (e.g., after trial ends).
        """
        loop = asyncio.get_running_loop()
        client = cls._get_client()
        plan_id = cls.get_plan_id(plan_type)

        # UPI autopay rejects expire_at beyond 30 years.
        # Monthly: 360 cycles = 30 years. Annual: 30 cycles = 30 years.
        total_count = 30 if plan_type == "annual" else 360
        payload: Dict[str, Any] = {
            "plan_id": plan_id,
            "total_count": total_count,
            "quantity": 1,
        }
        if start_at:
            payload["start_at"] = start_at
        if user_phone:
            payload["notify_info"] = {"notify_phone": user_phone}
        if user_name:
            payload["notes"] = {"user_name": user_name}

        try:
            sub = await loop.run_in_executor(None, client.subscription.create, payload)
            return sub
        except Exception as e:
            raise RazorpayError(f"Failed to create subscription: {e}")

    @classmethod
    async def cancel_subscription(cls, razorpay_subscription_id: str, cancel_at_cycle_end: bool = True) -> Dict:
        """Cancel subscription. cancel_at_cycle_end=True means cancel after current period."""
        loop = asyncio.get_running_loop()
        client = cls._get_client()
        try:
            result = await loop.run_in_executor(
                None,
                lambda: client.subscription.cancel(
                    razorpay_subscription_id,
                    {"cancel_at_cycle_end": 1 if cancel_at_cycle_end else 0}
                )
            )
            return result
        except Exception as e:
            raise RazorpayError(f"Failed to cancel subscription: {e}")

    @classmethod
    async def fetch_subscription(cls, razorpay_subscription_id: str) -> Dict:
        """Fetch current subscription state from Razorpay."""
        loop = asyncio.get_running_loop()
        client = cls._get_client()
        try:
            return await loop.run_in_executor(None, client.subscription.fetch, razorpay_subscription_id)
        except Exception as e:
            raise RazorpayError(f"Failed to fetch subscription: {e}")

    @staticmethod
    def verify_webhook_signature(body: bytes, signature: str) -> bool:
        """HMAC-SHA256 verification for Razorpay webhook payloads."""
        if not RAZORPAY_WEBHOOK_SECRET:
            logger.error("RAZORPAY_WEBHOOK_SECRET not configured")
            return False
        expected = hmac.new(
            RAZORPAY_WEBHOOK_SECRET.encode(),
            body,
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    @staticmethod
    def verify_payment_signature(
        razorpay_payment_id: str,
        razorpay_subscription_id: str,
        razorpay_signature: str,
    ) -> bool:
        """
        Verify the payment signature returned by Razorpay checkout.
        Signature = HMAC-SHA256(razorpay_payment_id + '|' + razorpay_subscription_id, key_secret).
        """
        if not RAZORPAY_KEY_SECRET:
            raise RazorpayError("RAZORPAY_KEY_SECRET not configured")
        message = f"{razorpay_payment_id}|{razorpay_subscription_id}"
        expected = hmac.new(
            RAZORPAY_KEY_SECRET.encode(),
            message.encode(),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, razorpay_signature)

    @staticmethod
    def get_checkout_key() -> str:
        """Returns the Razorpay Key ID for frontend checkout initialization."""
        if not RAZORPAY_KEY_ID:
            raise RazorpayError("RAZORPAY_KEY_ID not configured")
        return RAZORPAY_KEY_ID
