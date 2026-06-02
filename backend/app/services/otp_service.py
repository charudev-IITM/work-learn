"""
OTP orchestration — MSG91 send/verify + onboard key management.
Rate limiting is handled by SessionService (check_otp_send_limit, check_and_record_otp_attempt).
"""

import logging

from app.database.connection import redis_manager
from app.services.msg91_service import MSG91Service, MSG91Error

logger = logging.getLogger(__name__)


class OTPError(Exception):
    pass


class OTPService:
    ONBOARD_KEY_TTL_SECS = 1800   # 30 minutes to complete onboarding

    @staticmethod
    def _onboard_key(phone: str) -> str:
        return f"otp:onboard:{phone}"

    @staticmethod
    async def send_otp(phone_e164: str) -> None:
        """Fire MSG91 send. Rate limiting handled by SessionService.check_otp_send_limit()."""
        try:
            await MSG91Service.send_otp(phone_e164)
        except MSG91Error as e:
            raise OTPError(str(e))

    @staticmethod
    async def verify_otp(phone_e164: str, otp: str) -> bool:
        """Verify OTP via MSG91. On success, store onboard key in Redis."""
        try:
            verified = await MSG91Service.verify_otp(phone_e164, otp)
        except MSG91Error as e:
            raise OTPError(str(e))

        if not verified:
            raise OTPError("Invalid or expired OTP. Please try again.")

        # Mark phone as verified for onboarding step
        await redis_manager.set_json(
            OTPService._onboard_key(phone_e164),
            {"phone": phone_e164},
            expire=OTPService.ONBOARD_KEY_TTL_SECS,
        )

        return True

    @staticmethod
    async def consume_onboard_key(phone_e164: str) -> bool:
        """Atomically consume the verified-phone proof. Returns True if it existed."""
        client = redis_manager.async_redis_client
        if not client:
            return False
        # GETDEL is atomic - returns value and deletes in one operation
        value = await client.getdel(OTPService._onboard_key(phone_e164))
        return value is not None

    @staticmethod
    async def clear_onboard_key(phone_e164: str) -> None:
        """Delete onboard key (for returning users where we skip onboarding)."""
        await redis_manager.delete(OTPService._onboard_key(phone_e164))
