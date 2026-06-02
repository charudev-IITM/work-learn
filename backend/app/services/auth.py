"""
Authentication services for JWT token management and password handling.
Fully async using asyncpg + async SQLAlchemy sessions.
"""

import asyncio
import jwt
import bcrypt
import json
import os
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import User
from app.database.connection import AsyncSessionLocal, redis_manager

logger = logging.getLogger(__name__)

# Redis cache TTL for user lookups (seconds)
USER_CACHE_TTL = 60


class AuthError(Exception):
    """Custom authentication error"""
    pass


# Fields to cache for user objects (single source of truth)
_USER_CACHE_FIELDS = [
    "id", "username", "is_active", "is_admin", "phone",
    "name", "business", "onboarding_complete", "created_at", "last_login",
]


class _CachedUser:
    """Lightweight user object reconstructed from Redis cache."""

    def __init__(self, data: dict):
        for field in _USER_CACHE_FIELDS:
            value = data.get(field)
            # Deserialize datetime strings
            if field in ("created_at", "last_login") and isinstance(value, str):
                value = datetime.fromisoformat(value)
            setattr(self, field, value)


def _user_to_cache_dict(user) -> dict:
    """Serialize user model to a dict suitable for Redis caching."""
    result = {}
    for field in _USER_CACHE_FIELDS:
        value = getattr(user, field, None)
        if isinstance(value, datetime):
            value = value.isoformat()
        result[field] = value
    return result


async def _invalidate_user_cache(user_id: str):
    """Remove cached user from Redis after a mutation."""
    try:
        await redis_manager.delete(f"user:{user_id}")
    except Exception:
        pass


class AuthService:
    """Authentication service for user management and JWT operations"""

    # ------------------------------------------------------------------
    # Password helpers
    # ------------------------------------------------------------------

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password using bcrypt (CPU-bound)"""
        salt = bcrypt.gensalt(rounds=int(os.getenv('BCRYPT_ROUNDS', 12)))
        return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

    @staticmethod
    def verify_password(password: str, hashed: str) -> bool:
        """Verify a password against its hash (CPU-bound)"""
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

    @staticmethod
    async def hash_password_async(password: str) -> str:
        """Hash password without blocking the event loop"""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, AuthService.hash_password, password)

    @staticmethod
    async def verify_password_async(password: str, hashed: str) -> bool:
        """Verify password without blocking the event loop"""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, AuthService.verify_password, password, hashed)

    # ------------------------------------------------------------------
    # JWT helpers (no I/O)
    # ------------------------------------------------------------------

    @staticmethod
    def generate_jwt_token(
        user_id: str,
        username: str,
        is_admin: bool = False,
        jti: Optional[str] = None,
    ) -> str:
        """Generate JWT token for user. Embeds jti claim for session tracking."""
        from uuid import uuid4

        payload = {
            'user_id': user_id,
            'username': username,
            'is_admin': is_admin,
            'jti': jti or str(uuid4()),
            'exp': datetime.utcnow() + timedelta(hours=int(os.getenv('JWT_EXPIRATION_HOURS', 24))),
            'iat': datetime.utcnow()
        }
        jwt_secret = os.getenv('JWT_SECRET')
        if not jwt_secret:
            raise AuthError("JWT_SECRET not configured")
        return jwt.encode(payload, jwt_secret, algorithm='HS256')

    @staticmethod
    def validate_jwt_token(token: str) -> Dict:
        """Validate and decode JWT token"""
        try:
            jwt_secret = os.getenv('JWT_SECRET')
            if not jwt_secret:
                raise AuthError("JWT_SECRET not configured")
            payload = jwt.decode(token, jwt_secret, algorithms=['HS256'])
            return payload
        except jwt.ExpiredSignatureError:
            raise AuthError("Token has expired")
        except jwt.InvalidTokenError:
            raise AuthError("Invalid token")

    # ------------------------------------------------------------------
    # Master key
    # ------------------------------------------------------------------

    @staticmethod
    def validate_master_key(master_key: str) -> bool:
        """Validate master key for signup"""
        expected_master_key = os.getenv('MASTER_KEY')
        if not expected_master_key:
            raise AuthError("MASTER_KEY not configured")
        received_key = master_key.strip()
        expected_key = expected_master_key.strip()
        is_valid = received_key == expected_key
        if not is_valid:
            logger.warning("Master key validation failed")
        return is_valid

    # ------------------------------------------------------------------
    # User CRUD (async)
    # ------------------------------------------------------------------

    @staticmethod
    async def create_user(username: str, password: str, master_key: str, is_admin: bool = False) -> User:
        """Create a new user with master key validation (async)"""
        if not AuthService.validate_master_key(master_key):
            raise AuthError("Invalid master key")

        password_hash = await AuthService.hash_password_async(password)

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).filter_by(username=username)
            )
            if result.scalar_one_or_none():
                raise AuthError("Username already exists")

            user = User(username=username, password_hash=password_hash, is_admin=is_admin)
            session.add(user)
            await session.commit()
            await session.refresh(user)
            return user

    @staticmethod
    async def create_admin_user(username: str, password: str, master_key: str) -> User:
        """Create a new admin user (async)"""
        return await AuthService.create_user(username, password, master_key, is_admin=True)

    @staticmethod
    async def authenticate_user(username: str, password: str) -> Optional[User]:
        """Authenticate user with username and password (async)"""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).filter_by(username=username, is_active=True)
            )
            user = result.scalar_one_or_none()
            if not user:
                return None

            if not await AuthService.verify_password_async(password, user.password_hash):
                return None

            user.last_login = datetime.utcnow()
            await session.commit()
            await session.refresh(user)
            await _invalidate_user_cache(user.id)
            return user

    @staticmethod
    async def get_user_by_id(user_id: str) -> Optional[User]:
        """Get user by ID with Redis caching (async)"""
        cache_key = f"user:{user_id}"
        try:
            cached = await redis_manager.get(cache_key)
            if cached:
                return _CachedUser(json.loads(cached))
        except Exception:
            pass

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).filter_by(id=user_id, is_active=True)
            )
            user = result.scalar_one_or_none()
            if user:
                try:
                    await redis_manager.set(cache_key, json.dumps(_user_to_cache_dict(user)), USER_CACHE_TTL)
                except Exception:
                    pass
            return user

    @staticmethod
    async def get_user_by_phone(phone_e164: str) -> Optional[User]:
        """Get active user by phone number (async)"""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).filter_by(phone=phone_e164, is_active=True)
            )
            return result.scalar_one_or_none()

    @staticmethod
    async def create_phone_user(phone_e164: str) -> User:
        """Create a new user identified by phone number (async)"""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).filter_by(phone=phone_e164)
            )
            if result.scalar_one_or_none():
                raise AuthError("Phone number already registered")

            user = User(
                username=phone_e164,
                password_hash=None,
                phone=phone_e164,
                onboarding_complete=False,
                is_admin=False,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
            return user

    @staticmethod
    async def touch_last_login(user_id: str) -> None:
        """Update last_login timestamp in the database."""
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(User).where(User.id == user_id).values(last_login=datetime.utcnow())
            )
            await session.commit()
        await _invalidate_user_cache(user_id)

    @staticmethod
    async def complete_onboarding(user_id: str, name: str, business: Optional[str]) -> User:
        """Set name and business for user profile (async).

        Note: onboarding_complete is NOT set here — it is set by
        OnboardingService.mark_complete() after the full wizard finishes.
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).filter_by(id=user_id)
            )
            user = result.scalar_one_or_none()
            if not user:
                raise AuthError("User not found")
            user.name = name
            user.business = business
            user.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(user)
            await _invalidate_user_cache(user_id)
            return user
