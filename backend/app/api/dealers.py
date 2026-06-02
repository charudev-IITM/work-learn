"""
Dealer metadata API — exposes dealer city/state/logo for frontend filters.
"""

import logging
from fastapi import APIRouter, Depends

from ..api.auth import require_subscription
from ..database.connection import redis_manager, shared_redis
from ..database.models import User
from ..schemas.dealers import DealerMetadataItem, DealerMetadataResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dealers", tags=["dealers"])

CACHE_KEY = "dealers:metadata"
CACHE_TTL = 3600  # 1 hour


@router.get("/metadata", response_model=DealerMetadataResponse)
async def get_dealer_metadata(
    current_user: User = Depends(require_subscription),
):
    """Return dealer metadata with city/state for filtering."""

    # Try Redis cache first
    cached = await redis_manager.get_json(CACHE_KEY)
    if cached:
        return cached

    # Fallback: read individual dealer hashes from Redis
    # (populated by production scraper CronJob, shared via cross-namespace Redis)
    redis = shared_redis.async_redis_client
    if not redis:
        return DealerMetadataResponse(dealers=[], cities=[]).model_dump()

    dealer_ids = await redis.smembers("dealer:metadata:all")
    dealers = []
    if dealer_ids:
        pipe = redis.pipeline()
        for did in sorted(dealer_ids):
            did_str = did.decode() if isinstance(did, bytes) else did
            pipe.hgetall(f"dealer:metadata:{did_str}")
        results = await pipe.execute()
        for data in results:
            if not data:
                continue
            # Decode bytes keys/values from Redis
            decoded = {
                (k.decode() if isinstance(k, bytes) else k): (v.decode() if isinstance(v, bytes) else v)
                for k, v in data.items()
            }
            if decoded.get("dealer_id"):
                dealers.append(DealerMetadataItem(
                    dealer_id=decoded["dealer_id"],
                    name=decoded.get("name") or None,
                    city=decoded.get("city") or None,
                    state=decoded.get("state") or None,
                    logo_url=decoded.get("logo_url") or None,
                ))

    cities = sorted(
        {d.city for d in dealers if d.city},
    )

    response = DealerMetadataResponse(dealers=dealers, cities=cities)
    payload = response.model_dump()

    await redis_manager.set_json(CACHE_KEY, payload, expire=CACHE_TTL)

    return payload
