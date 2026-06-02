"""
Authentication API endpoints - Phone OTP + legacy admin password auth
"""

import asyncio
import os
from datetime import datetime
from uuid import uuid4
from fastapi import APIRouter, HTTPException, Depends, Header, Request, Response, Cookie
from pydantic import BaseModel
from typing import Optional
import logging

from app.services.auth import AuthService, AuthError
from app.services.msg91_service import MSG91Service, MSG91Error
from app.services.otp_service import OTPService, OTPError
from app.services.session_service import (
    SessionService, OTPRateLimitError, OTPSendRateLimitError, MAX_OTP_ATTEMPTS,
)
from app.services.turnstile import verify_turnstile
from app.utils.profanity import contains_profanity
from app.database.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["authentication"])


def _normalize_phone(raw_phone: str) -> str:
    """Normalize phone to E.164 format, raising HTTPException on bad input."""
    try:
        return MSG91Service.normalize_phone(raw_phone)
    except MSG91Error as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Pydantic Models ──────────────────────────────────────────────────────────

# Shared response models (must be defined before models that reference them)
class UserResponse(BaseModel):
    id: str
    username: str
    phone: Optional[str] = None
    name: Optional[str] = None
    business: Optional[str] = None
    createdAt: str
    is_admin: bool = False
    needs_onboarding: bool = False

class AuthResponse(BaseModel):
    user: UserResponse
    message: str = "Authentication successful"
    token: Optional[str] = None  # Returned for mobile clients (bearer auth)

class ValidationResponse(BaseModel):
    valid: bool
    user: UserResponse

class MessageResponse(BaseModel):
    message: str

# OTP flow
class OTPSendRequest(BaseModel):
    phone: str
    turnstile_token: Optional[str] = None
    is_resend: bool = False

class OTPVerifyRequest(BaseModel):
    phone: str
    otp: str

class OnboardingRequest(BaseModel):
    phone: str
    name: str
    business: Optional[str] = None

class OTPSendResponse(BaseModel):
    message: str

class OTPVerifyResponse(BaseModel):
    user: UserResponse
    message: str
    needs_onboarding: bool
    token: Optional[str] = None  # Returned for mobile clients (bearer auth)

# Legacy admin auth
class SignupRequest(BaseModel):
    username: str
    password: str
    masterKey: str

class LoginRequest(BaseModel):
    username: str
    password: str


# ── Helpers ──────────────────────────────────────────────────────────────────

def _set_auth_cookie(response: Response, token: str) -> None:
    """Set httpOnly auth cookie on response"""
    response.set_cookie(
        key="auth_token",
        value=token,
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        max_age=86400,
        path="/",
    )

def _build_user_response(user: User) -> UserResponse:
    """Build UserResponse from User model"""
    return UserResponse(
        id=user.id,
        username=user.username or user.phone or user.id,
        phone=user.phone,
        name=user.name,
        business=user.business,
        createdAt=user.created_at.isoformat() if user.created_at else "",
        is_admin=user.is_admin,
        needs_onboarding=(user.phone is not None and not user.onboarding_complete),
    )


# ── Helper Functions ─────────────────────────────────────────────────────────

def _extract_device_hint(ua: str) -> str:
    """Lightweight UA parser for device classification."""
    ua_lower = (ua or "").lower()
    if "android" in ua_lower:
        return "Android"
    if "iphone" in ua_lower or "ipad" in ua_lower:
        return "iOS"
    if "windows" in ua_lower:
        return "Windows"
    if "macintosh" in ua_lower or "mac os" in ua_lower:
        return "macOS"
    if "linux" in ua_lower:
        return "Linux"
    return "Unknown"


async def _create_user_session(user_id: str, request: Request, is_admin: bool = False) -> str:
    """Create a new session and return the jti. Consolidates repeated session-creation logic."""
    jti = str(uuid4())
    ip = getattr(request.state, "client_ip", request.client.host if request.client else "unknown")
    ua = request.headers.get("user-agent", "")
    device = _extract_device_hint(ua)
    if is_admin:
        await SessionService.create_admin_session(user_id, jti, ip, ua, device)
    else:
        await SessionService.create_session(user_id, jti, ip, ua, device)
    return jti


async def _notify_displaced_user(user_id: str, name: str | None = None) -> None:
    """Send session_displaced message via WebSocket."""
    try:
        from app.services.websocket_manager import websocket_manager
        await websocket_manager.send_to_user(
            user_id,
            {
                "type": "session_displaced",
                "message": "Your session has been signed in on another device.",
            },
        )
    except Exception as e:
        logger.debug(f"Session displacement notify failed for {user_id}: {e}")


# ── Auth Dependencies ────────────────────────────────────────────────────────

async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    auth_token: Optional[str] = Cookie(None),
):
    """Extract and validate current user from httpOnly cookie or Authorization header"""
    token = auth_token

    if not token and authorization:
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid authorization format")
        token = authorization.split(" ")[1]

    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        payload = AuthService.validate_jwt_token(token)
        user_id = payload["user_id"]
        jti = payload.get("jti")
        is_admin = payload.get("is_admin", False)

        # Stash jti for downstream handlers (e.g. per-session logout)
        request.state.jti = jti

        # Run session validation and user fetch concurrently
        if jti:
            if is_admin:
                session_coro = SessionService.validate_admin_session(user_id, jti)
            else:
                session_coro = SessionService.validate_session(user_id, jti)
        else:
            session_coro = None
        user_coro = AuthService.get_user_by_id(user_id)

        if session_coro:
            session_valid, user = await asyncio.gather(session_coro, user_coro)
            if not session_valid:
                raise HTTPException(
                    status_code=401,
                    detail={
                        "code": "SESSION_INVALIDATED",
                        "message": "Your session has expired. Please sign in again.",
                    },
                )
        else:
            user = await user_coro

        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except HTTPException:
        raise
    except AuthError as e:
        raise HTTPException(status_code=401, detail=str(e))

async def get_current_admin_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    auth_token: Optional[str] = Cookie(None),
):
    """Extract and validate current admin user"""
    user = await get_current_user(request, authorization, auth_token)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def is_access_allowed(user_id: str, is_admin: bool, onboarding_complete: bool) -> bool:
    """Check if a user has access to protected resources.
    Returns True if access should be granted (active trial, active preview, subscription, or admin)."""
    from app.services.subscription_service import SubscriptionService

    if not onboarding_complete:
        # Trial check first — user may have claimed trial but mark_complete failed
        _, trial_active, _ = await SubscriptionService._check_trial(user_id)
        if trial_active:
            return True
        from app.services.preview_timer_service import PreviewTimerService
        return not await PreviewTimerService.is_expired(user_id)

    return await SubscriptionService.is_access_granted(user_id, is_admin)


async def require_subscription(
    current_user: User = Depends(get_current_user),
):
    """
    FastAPI dependency that gates access behind an active subscription.
    Admins bypass. Users still in onboarding preview bypass (onboarding_complete=False).
    Others must have status in ACTIVE_STATUSES (active, authenticated, pending).
    """
    if not await is_access_allowed(current_user.id, current_user.is_admin, current_user.onboarding_complete):
        raise HTTPException(
            status_code=402,
            detail={
                "code": "SUBSCRIPTION_REQUIRED",
                "message": "An active subscription is required to access this feature",
            }
        )
    return current_user


# ── OTP Endpoints ────────────────────────────────────────────────────────────

@router.post("/otp/send", response_model=OTPSendResponse)
async def otp_send(request: OTPSendRequest, http_request: Request):
    """Send OTP to phone number (Turnstile protected)"""
    # Verify CAPTCHA on initial send only — resends are already rate-limited
    # and the user proved humanity on the first send. Turnstile tokens are
    # single-use so requiring one on resend would force a widget re-render.
    if not request.is_resend:
        turnstile_configured = bool(os.getenv("TURNSTILE_SECRET_KEY", ""))
        if request.turnstile_token:
            if not await verify_turnstile(request.turnstile_token):
                raise HTTPException(status_code=403, detail="Turnstile verification failed")
        elif turnstile_configured:
            # Turnstile is configured but no token sent — reject
            raise HTTPException(status_code=403, detail="Captcha verification required")
        # else: no captcha configured (dev mode) — skip verification

    phone_e164 = _normalize_phone(request.phone)

    # Rate limit OTP sends per-phone and per-IP (prevents SMS wallet drain)
    client_ip = getattr(http_request.state, "client_ip", http_request.client.host if http_request.client else "unknown")
    try:
        await SessionService.check_otp_send_limit(phone_e164, client_ip)
    except OTPSendRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))

    # Send OTP
    try:
        await OTPService.send_otp(phone_e164)
    except OTPError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except Exception as e:
        logger.error(f"OTP send error for {phone_e164}: {e}")
        raise HTTPException(status_code=500, detail="OTP service unavailable")

    return OTPSendResponse(message="OTP sent successfully")


@router.post("/otp/verify", response_model=OTPVerifyResponse)
async def otp_verify(
    request: OTPVerifyRequest, response: Response, http_request: Request,
):
    """Verify OTP. Existing users get JWT immediately. New users need onboarding."""
    phone_e164 = _normalize_phone(request.phone)

    # Per-IP verify rate limit (prevents parallel-phone brute force)
    client_ip = getattr(http_request.state, "client_ip", http_request.client.host if http_request.client else "unknown")
    try:
        await SessionService.check_otp_verify_ip_limit(client_ip)
    except OTPRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))

    # Atomic OTP attempt check + increment (INCR-then-check eliminates TOCTOU race)
    try:
        remaining = await SessionService.check_and_record_otp_attempt(phone_e164)
    except OTPRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))

    try:
        await OTPService.verify_otp(phone_e164, request.otp)
    except OTPError as e:
        detail = str(e)
        if remaining > 0:
            detail += f" ({remaining} attempts remaining)"
        raise HTTPException(status_code=401, detail=detail)
    except Exception as e:
        logger.error(f"OTP verify error: {e}")
        raise HTTPException(status_code=500, detail="OTP service unavailable")

    # Clear OTP attempt counter on success
    await SessionService.clear_otp_attempts(phone_e164)

    existing_user = await AuthService.get_user_by_phone(phone_e164)

    if existing_user:
        # Returning user: session lifecycle + issue JWT
        displaced_jti = await SessionService.invalidate_all_sessions(
            existing_user.id, "new_login"
        )
        jti = await _create_user_session(existing_user.id, http_request)
        if displaced_jti:
            await _notify_displaced_user(existing_user.id, existing_user.name)

        await AuthService.touch_last_login(existing_user.id)
        token = AuthService.generate_jwt_token(
            existing_user.id,
            existing_user.username or phone_e164,
            existing_user.is_admin,
            jti=jti,
        )
        _set_auth_cookie(response, token)
        await OTPService.clear_onboard_key(phone_e164)

        return OTPVerifyResponse(
            user=_build_user_response(existing_user),
            message="Login successful",
            needs_onboarding=False,
            token=token,
        )
    else:
        # New user: OTP verified, needs onboarding
        return OTPVerifyResponse(
            user=UserResponse(
                id="",
                username=phone_e164,
                phone=phone_e164,
                name=None,
                business=None,
                createdAt="",
                is_admin=False,
                needs_onboarding=True,
            ),
            message="OTP verified. Please complete your profile.",
            needs_onboarding=True,
        )


@router.post("/onboarding", response_model=AuthResponse)
async def complete_onboarding(
    request: OnboardingRequest, response: Response, http_request: Request,
):
    """Complete profile for a new phone user. Requires prior OTP verification."""
    phone_e164 = _normalize_phone(request.phone)

    # Atomically consume the verified-phone proof (prevents double-submit race)
    if not await OTPService.consume_onboard_key(phone_e164):
        raise HTTPException(
            status_code=403, detail="Phone verification required before onboarding"
        )

    # Validate name
    name = request.name.strip()
    if not name or len(name) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 characters")
    if len(name) > 100:
        raise HTTPException(status_code=400, detail="Name must be under 100 characters")
    if contains_profanity(name):
        raise HTTPException(
            status_code=400, detail="Name contains inappropriate content"
        )

    # Validate business (optional)
    business = None
    if request.business:
        business = request.business.strip()
        if business:
            if len(business) > 200:
                raise HTTPException(
                    status_code=400, detail="Business name must be under 200 characters"
                )
            if contains_profanity(business):
                raise HTTPException(
                    status_code=400,
                    detail="Business name contains inappropriate content",
                )
        else:
            business = None

    try:
        # Handle double-submit: check if user already exists
        existing = await AuthService.get_user_by_phone(phone_e164)
        if existing:
            user = await AuthService.complete_onboarding(existing.id, name, business)
        else:
            user = await AuthService.create_phone_user(phone_e164)
            user = await AuthService.complete_onboarding(user.id, name, business)

        # Session lifecycle
        await SessionService.invalidate_all_sessions(user.id, "new_login")
        jti = await _create_user_session(user.id, http_request)

        token = AuthService.generate_jwt_token(
            user.id, user.username or phone_e164, user.is_admin, jti=jti,
        )
        _set_auth_cookie(response, token)

        return AuthResponse(
            user=_build_user_response(user),
            message="Welcome! Account created successfully.",
            token=token,
        )

    except AuthError as e:
        logger.error(f"Onboarding error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Onboarding unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Account creation failed")


# ── Legacy Auth Endpoints (admin) ────────────────────────────────────────────

@router.post("/signup", response_model=AuthResponse, status_code=201)
async def signup(request: SignupRequest, response: Response, http_request: Request):
    """Register a new user with master key validation (legacy)"""
    try:
        user = await AuthService.create_user(
            username=request.username,
            password=request.password,
            master_key=request.masterKey,
        )

        jti = await _create_user_session(user.id, http_request)
        token = AuthService.generate_jwt_token(user.id, user.username, user.is_admin, jti=jti)
        _set_auth_cookie(response, token)

        return AuthResponse(
            user=_build_user_response(user), message="Signup successful"
        )

    except AuthError as e:
        if "Invalid master key" in str(e):
            raise HTTPException(status_code=401, detail="Invalid master key")
        elif "Username already exists" in str(e):
            raise HTTPException(status_code=400, detail="Username already exists")
        else:
            logger.error(f"Signup error: {e}")
            raise HTTPException(
                status_code=500, detail="Authentication service unavailable"
            )
    except Exception as e:
        logger.error(f"Unexpected signup error: {e}")
        raise HTTPException(
            status_code=500, detail="Authentication service unavailable"
        )


@router.post("/admin/signup", response_model=AuthResponse, status_code=201)
async def admin_signup(request: SignupRequest, response: Response, http_request: Request):
    """Register a new admin user with master key validation"""
    try:
        user = await AuthService.create_admin_user(
            username=request.username,
            password=request.password,
            master_key=request.masterKey,
        )

        jti = await _create_user_session(user.id, http_request, is_admin=True)
        token = AuthService.generate_jwt_token(user.id, user.username, user.is_admin, jti=jti)
        _set_auth_cookie(response, token)

        return AuthResponse(
            user=_build_user_response(user), message="Admin signup successful"
        )

    except AuthError as e:
        if "Invalid admin key" in str(e):
            raise HTTPException(status_code=401, detail="Invalid admin key")
        elif "Username already exists" in str(e):
            raise HTTPException(status_code=400, detail="Username already exists")
        else:
            logger.error(f"Admin signup error: {e}")
            raise HTTPException(
                status_code=500, detail="Authentication service unavailable"
            )
    except Exception as e:
        logger.error(f"Unexpected admin signup error: {e}")
        raise HTTPException(
            status_code=500, detail="Authentication service unavailable"
        )


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest, response: Response, http_request: Request):
    """Authenticate user with username and password (legacy/admin)"""
    try:
        user = await AuthService.authenticate_user(request.username, request.password)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if user.is_admin:
            jti = await _create_user_session(user.id, http_request, is_admin=True)
        else:
            displaced = await SessionService.invalidate_all_sessions(user.id, "new_login")
            jti = await _create_user_session(user.id, http_request)
            if displaced:
                await _notify_displaced_user(user.id)

        token = AuthService.generate_jwt_token(user.id, user.username, user.is_admin, jti=jti)
        _set_auth_cookie(response, token)

        return AuthResponse(
            user=_build_user_response(user), message="Login successful"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(
            status_code=500, detail="Authentication service unavailable"
        )


@router.get("/validate", response_model=ValidationResponse)
async def validate_token(current_user: User = Depends(get_current_user)):
    """Validate JWT token and return user info"""
    return ValidationResponse(valid=True, user=_build_user_response(current_user))


@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request, response: Response, current_user: User = Depends(get_current_user)
):
    """Logout user (clear httpOnly cookie + invalidate sessions)"""
    if current_user.is_admin:
        # Per-session removal — other admin sessions stay active
        jti = getattr(request.state, "jti", None)
        if jti:
            await SessionService.invalidate_session(current_user.id, jti, "logout")
        else:
            await SessionService.invalidate_all_sessions(current_user.id, "logout")
    else:
        await SessionService.invalidate_all_sessions(current_user.id, "logout")
    response.delete_cookie(key="auth_token", path="/", samesite="lax")
    return MessageResponse(message="Logged out successfully")
