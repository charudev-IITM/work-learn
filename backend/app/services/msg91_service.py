"""
MSG91 OTP service - handles API communication and phone normalization
"""

import os
import re
import logging
import aiohttp

logger = logging.getLogger(__name__)

# Shared session for connection reuse (created lazily, closed at shutdown)
_http_session: aiohttp.ClientSession | None = None


def _get_session() -> aiohttp.ClientSession:
    global _http_session
    if _http_session is None or _http_session.closed:
        _http_session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10))
    return _http_session


async def close_msg91_session() -> None:
    global _http_session
    if _http_session and not _http_session.closed:
        await _http_session.close()
        _http_session = None


class MSG91Error(Exception):
    pass


_MSG91_AUTH_KEY = os.getenv("MSG91_AUTH_KEY", "")
_MSG91_TEMPLATE_ID = os.getenv("MSG91_TEMPLATE_ID", "")
_MSG91_WHATSAPP_TEMPLATE_ID = os.getenv("MSG91_WHATSAPP_ALERT_TEMPLATE_ID", "")
_MSG91_WHATSAPP_SENDER = os.getenv("MSG91_WHATSAPP_SENDER", "")
_DEV_OTP = "0000"
_IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() == "production"
# Dev mode: no real auth key, OR explicit bypass flag — but NEVER in production.
# Skips real SMS send and accepts 0000. WhatsApp alerts still use credentials if available.
_DEV_MODE = (
    not _IS_PRODUCTION
    and (
        not _MSG91_AUTH_KEY
        or _MSG91_AUTH_KEY.startswith("your_")
        or os.getenv("DEV_OTP_BYPASS", "").lower() in ("1", "true", "yes")
    )
)
if _IS_PRODUCTION and os.getenv("DEV_OTP_BYPASS", ""):
    logger.warning("SECURITY: DEV_OTP_BYPASS is set but IGNORED in production")


class MSG91Service:
    # Country codes: India, US/Canada, UAE
    ALLOWED_PREFIXES = {"91", "1", "971"}
    BASE_URL = "https://api.msg91.com"

    # Minimum total digit lengths per prefix (country code + local number)
    MIN_LENGTHS = {"971": 12, "91": 12, "1": 11}

    @staticmethod
    def normalize_phone(raw: str) -> str:
        """
        Normalize phone input to E.164 digits (no '+').
        Examples:
          +91 98765 43210 -> 919876543210
          9876543210      -> 919876543210 (assumes India)
          +1 555 123 4567 -> 15551234567
          +971501234567   -> 971501234567
        """
        digits = re.sub(r"\D", "", raw)

        # Try longest prefix first to avoid ambiguity (971 > 91 > 1)
        for prefix in sorted(MSG91Service.ALLOWED_PREFIXES, key=len, reverse=True):
            if digits.startswith(prefix):
                min_len = MSG91Service.MIN_LENGTHS.get(prefix, 10)
                if len(digits) < min_len:
                    raise MSG91Error("Phone number is too short")
                return digits

        # Bare 10-digit number -> assume India
        if len(digits) == 10:
            return "91" + digits

        raise MSG91Error(
            "Phone number must be from India (+91), US/Canada (+1), or Dubai (+971)"
        )

    @staticmethod
    async def send_otp(phone_e164: str) -> None:
        """Send OTP via MSG91 API v5. In dev mode (no auth key), skips the real call."""
        if _DEV_MODE:
            logger.info(f"DEV MODE: OTP for {phone_e164} is {_DEV_OTP}")
            return

        if not _MSG91_AUTH_KEY or not _MSG91_TEMPLATE_ID:
            raise MSG91Error("MSG91 credentials not configured")

        url = f"{MSG91Service.BASE_URL}/api/v5/otp"
        params = {
            "template_id": _MSG91_TEMPLATE_ID,
            "mobile": phone_e164,
            "authkey": _MSG91_AUTH_KEY,
            "otp_length": "4",
        }

        try:
            session = _get_session()
            async with session.post(url, params=params) as resp:
                data = await resp.json()
                if data.get("type") == "error":
                    raise MSG91Error(
                        data.get("message", "Failed to send OTP")
                    )
        except aiohttp.ClientError as e:
            logger.error(f"MSG91 send_otp network error: {e}")
            raise MSG91Error("OTP service temporarily unavailable")

    @staticmethod
    async def verify_otp(phone_e164: str, otp: str) -> bool:
        """Verify OTP via MSG91 API v5. In dev mode, accepts dev OTP."""
        if _DEV_MODE:
            return otp == _DEV_OTP

        if not _MSG91_AUTH_KEY:
            raise MSG91Error("MSG91 credentials not configured")

        url = f"{MSG91Service.BASE_URL}/api/v5/otp/verify"
        params = {
            "mobile": phone_e164,
            "otp": otp,
            "authkey": _MSG91_AUTH_KEY,
        }

        try:
            session = _get_session()
            async with session.post(url, params=params) as resp:
                data = await resp.json()
                return data.get("type") == "success"
        except aiohttp.ClientError as e:
            logger.error(f"MSG91 verify_otp network error: {e}")
            raise MSG91Error("OTP service temporarily unavailable")

    @staticmethod
    async def send_whatsapp(phone_e164: str, template_vars: dict) -> None:
        """Send WhatsApp message via MSG91 Flow API. In dev mode, logs and returns."""
        if _DEV_MODE:
            logger.info(f"DEV MODE: WhatsApp alert to {phone_e164}: {template_vars}")
            return

        if not _MSG91_AUTH_KEY or not _MSG91_WHATSAPP_TEMPLATE_ID:
            raise MSG91Error("MSG91 WhatsApp credentials not configured")

        url = "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/"
        headers = {
            "authkey": _MSG91_AUTH_KEY,
            "Content-Type": "application/json",
            "accept": "application/json",
        }
        payload = {
            "integrated_number": _MSG91_WHATSAPP_SENDER,
            "content_type": "template",
            "payload": {
                "type": "template",
                "template": {
                    "name": _MSG91_WHATSAPP_TEMPLATE_ID,
                    "language": {"code": "en", "policy": "deterministic"},
                    "to_and_components": [
                        {
                            "to": [phone_e164],
                            "components": {
                                "body_1": {"type": "text", "value": template_vars.get("dealer_name", "")},
                                "body_2": {"type": "text", "value": template_vars.get("script_name", "")},
                                "body_3": {"type": "text", "value": template_vars.get("condition_text", "")},
                                "body_4": {"type": "text", "value": str(template_vars.get("current_rate", ""))},
                                "body_5": {"type": "text", "value": str(template_vars.get("threshold", ""))},
                            },
                        }
                    ],
                },
                "messaging_product": "whatsapp",
            },
        }

        try:
            session = _get_session()
            async with session.post(url, json=payload, headers=headers) as resp:
                data = await resp.json()
                if data.get("status") == "fail" or data.get("hasError"):
                    raise MSG91Error(data.get("errors", "WhatsApp send failed"))
        except aiohttp.ClientError as e:
            logger.error(f"MSG91 send_whatsapp network error: {e}")
            raise MSG91Error("WhatsApp service temporarily unavailable")
