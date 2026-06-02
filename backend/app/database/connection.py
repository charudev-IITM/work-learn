from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
import os
import redis.asyncio as aioredis
import json
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

# Database configuration
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/bullion_intel"
)

# Async database URL
ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# --- Async engine ---
async_engine = create_async_engine(
    ASYNC_DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    async_engine, class_=AsyncSession, expire_on_commit=False
)


class DatabaseManager:
    """Database connection manager using async engine"""

    async def create_tables(self):
        """Create all tables and apply schema migrations"""
        from .models import Base
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Migrate: make username/password_hash nullable for phone-OTP users
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE users ALTER COLUMN username DROP NOT NULL"
                )
            )
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL"
                )
            )
        logger.info("Database tables created")


class RedisManager:
    """Redis connection manager with connection pooling and pub/sub support"""

    def __init__(self, redis_url: str = None, max_connections: int = 250):
        self.redis_url = redis_url or REDIS_URL
        self._max_connections = max_connections
        self.redis_client = None
        self.async_redis_client: Optional[aioredis.Redis] = None
        self._pool: Optional[aioredis.ConnectionPool] = None

    async def connect(self):
        """Connect to Redis using a connection pool"""
        if self.async_redis_client:
            return  # Already connected
        try:
            # Create a shared connection pool
            # BlockingConnectionPool queues requests when pool is exhausted
            # instead of throwing "Too many connections" errors.
            self._pool = aioredis.BlockingConnectionPool.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True,
                max_connections=self._max_connections,
                timeout=10,
            )
            self.async_redis_client = aioredis.Redis(connection_pool=self._pool)

            # Test connection
            await self.async_redis_client.ping()
            logger.info(f"Connected to Redis (blocking pool, max_connections={self._max_connections})")

        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            self.async_redis_client = None
            self._pool = None

    async def disconnect(self):
        """Disconnect from Redis"""
        if self.async_redis_client:
            await self.async_redis_client.aclose()
        if self._pool:
            await self._pool.aclose()
        logger.info("Disconnected from Redis")

    def get_pubsub(self):
        """Get a new pub/sub instance (uses the shared pool)"""
        if not self.async_redis_client:
            return None
        return self.async_redis_client.pubsub()

    async def get(self, key: str) -> Optional[str]:
        """Get value from Redis"""
        if not self.async_redis_client:
            return None

        try:
            return await self.async_redis_client.get(key)
        except Exception as e:
            logger.error(f"Redis GET error for key {key}: {e}")
            return None

    async def set(self, key: str, value: str, expire: int = 3600):
        """Set value in Redis with expiration"""
        if not self.async_redis_client:
            return False

        try:
            await self.async_redis_client.setex(key, expire, value)
            return True
        except Exception as e:
            logger.error(f"Redis SET error for key {key}: {e}")
            return False

    async def delete(self, key: str):
        """Delete key from Redis"""
        if not self.async_redis_client:
            return False

        try:
            await self.async_redis_client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Redis DELETE error for key {key}: {e}")
            return False

    async def mget(self, keys: list) -> list:
        """Get multiple values from Redis in a single round-trip"""
        if not self.async_redis_client or not keys:
            return [None] * len(keys)
        try:
            return await self.async_redis_client.mget(keys)
        except Exception as e:
            logger.error(f"Redis MGET error: {e}")
            return [None] * len(keys)

    async def get_json(self, key: str) -> Optional[Dict[str, Any]]:
        """Get JSON value from Redis"""
        value = await self.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error for key {key}: {e}")
        return None

    async def set_json(self, key: str, value: Dict[str, Any], expire: int = 3600):
        """Set JSON value in Redis"""
        try:
            json_str = json.dumps(value, default=str)
            return await self.set(key, json_str, expire)
        except (TypeError, ValueError) as e:
            logger.error(f"JSON encode error for key {key}: {e}")
            return False

    async def invalidate_pattern(self, pattern: str):
        """Delete all keys matching pattern"""
        if not self.async_redis_client:
            return False

        try:
            keys = [key async for key in self.async_redis_client.scan_iter(match=pattern, count=100)]
            if keys:
                await self.async_redis_client.delete(*keys)
                logger.info(f"Invalidated {len(keys)} keys matching {pattern}")
            return True
        except Exception as e:
            logger.error(f"Redis pattern invalidation error: {e}")
            return False

    async def sadd(self, key: str, *values: str) -> bool:
        """Add member(s) to Redis SET"""
        if not self.async_redis_client or not values:
            return False

        try:
            await self.async_redis_client.sadd(key, *values)
            return True
        except Exception as e:
            logger.error(f"Redis SADD error for key {key}: {e}")
            return False

    async def srem(self, key: str, *values: str) -> bool:
        """Remove member(s) from Redis SET"""
        if not self.async_redis_client or not values:
            return False

        try:
            await self.async_redis_client.srem(key, *values)
            return True
        except Exception as e:
            logger.error(f"Redis SREM error for key {key}: {e}")
            return False

    async def smembers(self, key: str) -> set:
        """Get all members of Redis SET"""
        if not self.async_redis_client:
            return set()

        try:
            members = await self.async_redis_client.smembers(key)
            return members
        except Exception as e:
            logger.error(f"Redis SMEMBERS error for key {key}: {e}")
            return set()

    async def scard(self, key: str) -> int:
        """Get cardinality (size) of Redis SET"""
        if not self.async_redis_client:
            return 0

        try:
            return await self.async_redis_client.scard(key)
        except Exception as e:
            logger.error(f"Redis SCARD error for key {key}: {e}")
            return 0

# Global instances
db_manager = DatabaseManager()
redis_manager = RedisManager()

# Read-only connection to production Redis for scraper data (pub/sub, dealer hashes).
# In production/dev: same instance as redis_manager. In staging: separate instance.
SHARED_REDIS_URL = os.getenv("SHARED_REDIS_URL", REDIS_URL)
shared_redis = RedisManager(SHARED_REDIS_URL, max_connections=30) if SHARED_REDIS_URL != REDIS_URL else redis_manager
