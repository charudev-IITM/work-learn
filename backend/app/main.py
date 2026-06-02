from dotenv import load_dotenv
load_dotenv()

from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import asyncio
import json
import logging
import os
import time
from typing import Dict, List
from contextlib import asynccontextmanager

from scrapers import get_all_scrapers, SCRAPERS
from .services.cached_rate_service import CachedRateService
from .services.websocket_manager import websocket_manager
from .api.auth import router as auth_router, get_current_user, require_subscription, is_access_allowed
from .api.watchlist import router as watchlist_router
from .api.dealer_requests import router as dealer_requests_router
from .api.billing import router as billing_router
from .api.alerts import router as alerts_router
from .api.news import router as news_router
from .api.calculator import router as calculator_router
from .api.onboarding import router as onboarding_router
from .api.agent import router as agent_router
from .api.dealers import router as dealers_router
from .api.rates_public import router as rates_public_router
from .api.admin import router as admin_router

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

# WebSocket access re-check interval (seconds)
WS_RECHECK_INTERVAL = 60

# Global instances
cached_rate_service = CachedRateService()
# websocket_manager imported from services.websocket_manager (global singleton)
scrapers = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    global scrapers

    logger.info("Starting competitive intelligence system...")

    # Initialize database tables (async)
    from .database.connection import db_manager
    try:
        await db_manager.create_tables()
        logger.info("Database tables initialized successfully")
    except Exception as e:
        logger.error(f"Database table initialization failed: {e}")

    # Initialize Razorpay plans
    try:
        from .services.razorpay_service import RazorpayService
        plan_ids = await RazorpayService.ensure_plans_exist()
        logger.info(f"Razorpay plans initialized: {plan_ids}")
    except Exception as e:
        logger.warning(f"Razorpay plan initialization skipped: {e}")

    # Initialize Meilisearch for news search
    try:
        from .services.meilisearch_client import meili_client
        await meili_client.start()
        logger.info("Meilisearch client initialized")
    except Exception as e:
        logger.warning(f"Meilisearch initialization skipped: {e}")

    # Start cloud IP detector (fetches datacenter IP ranges)
    from .services import cloud_ip_detector
    try:
        await cloud_ip_detector.start()
    except Exception as e:
        logger.warning(f"Cloud IP detector startup failed: {e}")

    # Build scrapers dict for /api/competitors endpoints
    scrapers = {scraper.config.competitor_name: scraper for scraper in get_all_scrapers()}

    # Start cached rate service (always needed: Redis pub/sub + WebSocket broadcasting)
    await cached_rate_service.start()
    cached_rate_service.set_websocket_manager(websocket_manager)

    # Initialize price alerts
    from .services.alert_service import alert_service
    from .services.alert_evaluator import alert_evaluator
    from .services.alert_delivery import alert_delivery_worker
    await alert_service.load_active_alerts()
    cached_rate_service.set_alert_evaluator(alert_evaluator, alert_delivery_worker.queue, alert_service)
    await alert_delivery_worker.start()

    # Initialize Goldie AI agent
    from .services.agent_service import agent_service
    await agent_service.start()

    logger.info("API-only mode: rates arrive via Redis pub/sub from scraper-worker")

    # Start background Prometheus metrics refresh
    _metrics_task = asyncio.create_task(_metrics_refresh_loop())
    _online_recorder_task = asyncio.create_task(_online_recorder_loop())
    _taxonomy_metrics_task = asyncio.create_task(_taxonomy_metrics_loop())

    yield

    _metrics_task.cancel()
    _online_recorder_task.cancel()
    _taxonomy_metrics_task.cancel()
    try:
        await asyncio.gather(
            _metrics_task, _online_recorder_task, _taxonomy_metrics_task,
            return_exceptions=True,
        )
    except Exception:
        pass

    # Shutdown
    logger.info("Shutting down...")
    await agent_service.stop()
    await alert_delivery_worker.stop()
    await cached_rate_service.stop()
    try:
        from .services.meilisearch_client import meili_client
        await meili_client.stop()
    except Exception:
        pass
    # Stop cloud IP detector
    try:
        await cloud_ip_detector.stop()
    except Exception:
        pass
    # Close shared HTTP sessions
    from app.services.msg91_service import close_msg91_session
    from app.services.turnstile import close_turnstile_session
    await close_msg91_session()
    await close_turnstile_session()

_is_production = os.getenv("ENVIRONMENT", "development") != "development"

app = FastAPI(
    title="Bullion Competitive Intelligence API",
    description="Real-time competitive intelligence for bullion dealers",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if _is_production else "/docs",
    redoc_url=None if _is_production else "/redoc",
    openapi_url=None if _is_production else "/openapi.json",
)

# Prometheus metrics
try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator().instrument(app).expose(app, endpoint="/metrics")
except ImportError:
    logger.warning("prometheus-fastapi-instrumentator not installed, /metrics endpoint disabled")

from .metrics import (
    SCRAPER_FRESHNESS, SCRAPER_LAST_UPDATE, WEBSOCKET_CONNECTIONS,
    COMPETITORS_WITH_DATA,
)

async def _metrics_refresh_loop():
    """Background task to update time-varying Prometheus gauges every 10s."""
    import time as _time
    while True:
        try:
            # WebSocket connections
            WEBSOCKET_CONNECTIONS.set(len(websocket_manager.active_connections))

            # Competitors with data
            COMPETITORS_WITH_DATA.set(len(cached_rate_service.current_rates))

            # Per-scraper freshness (seconds since last update)
            now_ts = _time.time()
            for scraper, last_ts_gauge in list(SCRAPER_LAST_UPDATE._metrics.items()):
                last_ts = last_ts_gauge._value.get()
                if last_ts > 0:
                    SCRAPER_FRESHNESS.labels(scraper=scraper[0]).set(now_ts - last_ts)
        except Exception as e:
            logger.debug("Metrics refresh error: %s", e)
        await asyncio.sleep(10)


async def _taxonomy_metrics_loop():
    """Update dealer intelligence Prometheus metrics every 45s."""
    from .services.taxonomy_metrics import refresh_taxonomy_metrics
    from .database.connection import shared_redis

    await asyncio.sleep(15)  # let rates arrive via pub/sub first
    while True:
        try:
            await refresh_taxonomy_metrics(
                cached_rate_service.current_rates, shared_redis
            )
        except Exception as e:
            logger.debug("Taxonomy metrics refresh error: %s", e)
        await asyncio.sleep(45)


async def _online_recorder_loop():
    """Record online user count every 60s for the admin online-history chart."""
    from .services.online_history_service import record_sample
    while True:
        await asyncio.sleep(60)
        try:
            count = await websocket_manager.global_online_count()
            await record_sample(count)
        except Exception as e:
            logger.debug("Online recorder error: %s", e)

# ── Middleware (FastAPI LIFO: last added = outermost = runs first) ──

# Innermost: AbuseTrackerMiddleware (needs request.state from SecurityHeader)
from .middleware.abuse_tracker import AbuseTrackerMiddleware
app.add_middleware(AbuseTrackerMiddleware)

# Middle: SecurityHeaderMiddleware (sets request.state)
from .middleware.security import SecurityHeaderMiddleware
app.add_middleware(SecurityHeaderMiddleware)

# Outermost: CORS (runs first on every request)
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth_router)
app.include_router(watchlist_router)
app.include_router(dealer_requests_router)
app.include_router(billing_router)
app.include_router(alerts_router)
app.include_router(news_router)
app.include_router(calculator_router)
app.include_router(onboarding_router)
app.include_router(agent_router)
app.include_router(dealers_router)
app.include_router(rates_public_router)
app.include_router(admin_router)

@app.get("/")
async def root():
    return {"message": "Bullion Competitive Intelligence API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "mode": "api",
        "websocket_connections": len(websocket_manager.active_connections),
        "competitors_with_data": len(cached_rate_service.current_rates),
    }

def _build_competitor_info(scraper_name: str, scrapers_status: dict) -> dict:
    scraper_config = scrapers[scraper_name].config if scraper_name in scrapers else None
    status = scrapers_status.get(scraper_name, {})
    return {
        "name": scraper_name,
        "base_url": scraper_config.base_url if scraper_config else "",
        "scraper_type": scraper_config.scraper_type.value if scraper_config else "unknown",
        "is_running": status.get("is_running", True)  # default True in API mode
    }

@app.get("/api/stats")
async def public_stats():
    """Public stats for the website (no auth required)."""
    from .database.connection import AsyncSessionLocal, redis_manager
    from sqlalchemy import text

    dealer_count = len(SCRAPERS)

    # Try Redis cache first (avoids DB hit)
    cached = await redis_manager.get_json("public:stats")
    if cached:
        return {"dealers": dealer_count, "cities": cached.get("cities", 0)}

    # Fallback: query DB, cache for 1 hour
    city_count = 0
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("SELECT COUNT(DISTINCT city) FROM dealer_metadata WHERE city IS NOT NULL")
            )
            city_count = result.scalar() or 0
        await redis_manager.set_json("public:stats", {"cities": city_count}, expire=3600)
    except Exception:
        pass

    return {"dealers": dealer_count, "cities": city_count}

@app.get("/api/competitors")
async def get_competitors(current_user=Depends(get_current_user)):
    try:
        return [_build_competitor_info(name, {}) for name in SCRAPERS]
    except Exception as e:
        logger.error(f"Error getting competitors: {e}")
        return [_build_competitor_info(name, {}) for name in SCRAPERS]

@app.get("/api/competitors/{competitor_name}/scripts")
async def get_competitor_scripts(competitor_name: str, current_user=Depends(get_current_user)):
    if competitor_name not in scrapers:
        return {"error": "Competitor not found"}

    try:
        current_rates = await cached_rate_service.get_current_rates_by_competitor(competitor_name)
        if current_rates and "rates" in current_rates and current_rates["rates"]:
            scripts = []
            for symbol, rate_data in current_rates["rates"].items():
                scripts.append({
                    'name': rate_data.get('script_name', symbol),
                    'symbol': symbol
                })
            return {"competitor": competitor_name, "scripts": scripts}

        scripts = await cached_rate_service.get_competitor_scripts(competitor_name)
        if scripts:
            return {"competitor": competitor_name, "scripts": scripts}

        scraper = scrapers[competitor_name]
        scripts = await scraper.get_available_scripts()
        return {"competitor": competitor_name, "scripts": scripts}

    except Exception as e:
        logger.error(f"Error getting scripts for {competitor_name}: {e}")
        return {"competitor": competitor_name, "scripts": []}

# ── Reference rates constants (module-level, allocated once) ──────────────
_REF_PRIORITY = ['csvbullion', 'ambicaaspot', 'nakodabullion', 'rsbl', 'shivsahai']
_REF_PRIORITY_SET = frozenset(_REF_PRIORITY)

def _pick_best_reference(candidates):
    """Pick best candidate: priority dealers first, then most recent timestamp."""
    if not candidates:
        return None
    best = max(candidates, key=lambda x: (
        -(_REF_PRIORITY.index(x['dealer_id']) if x['dealer_id'] in _REF_PRIORITY_SET else 999),
        x.get('timestamp') or '',
    ))
    return {'dealer_id': best['dealer_id'], 'symbol': best.get('symbol', '')}

@app.get("/api/rates/reference")
async def get_reference_rates(current_user=Depends(require_subscription)):
    """Return 8 reference rate slot mappings (dealer_id + symbol).
    Frontend resolves live prices from WebSocket rateStore."""
    from .services.rate_taxonomy import get_cached_taxonomy

    current_rates = await cached_rate_service.get_current_rates()
    classified, _ = await get_cached_taxonomy(current_rates, category='reference')

    # Flatten all classified items
    all_items = [item for items in classified.values() for item in items]

    # Bucket items by slot
    slots: Dict[str, List] = {
        'mcx_gold': [], 'mcx_silver': [],
        'gold_spot': [], 'silver_spot': [],
        'gold_am_fix': [], 'gold_pm_fix': [], 'silver_fix': [],
        'inr_usd': [],
    }

    for item in all_items:
        c = item.get('classification', {})
        commodity = c.get('commodity', '')
        market_type = c.get('market_type', '')
        notes = (c.get('notes') or '').lower()
        sym_sn = (item.get('symbol', '') + ' ' + item.get('script_name', '')).lower()
        is_am_fix = 'am fix' in notes or 'am fix' in sym_sn or 'amfix' in sym_sn or 'goldam' in sym_sn
        is_pm_fix = 'pm fix' in notes or 'pm fix' in sym_sn or 'pmfix' in sym_sn or 'goldpm' in sym_sn
        is_any_fix = 'fix' in notes or 'fix' in sym_sn

        if commodity == 'USD/INR':
            slots['inr_usd'].append(item)
        elif commodity == 'Gold' and market_type in ('MCX', 'Futures'):
            slots['mcx_gold'].append(item)
        elif commodity == 'Silver' and market_type in ('MCX', 'Futures'):
            slots['mcx_silver'].append(item)
        elif commodity == 'XAUUSD':
            if is_am_fix:
                slots['gold_am_fix'].append(item)
            elif is_pm_fix:
                slots['gold_pm_fix'].append(item)
            else:
                slots['gold_spot'].append(item)
        elif commodity == 'XAGUSD':
            if is_any_fix:
                slots['silver_fix'].append(item)
            else:
                slots['silver_spot'].append(item)

    data = {k: _pick_best_reference(v) for k, v in slots.items()}
    return Response(
        content=json.dumps(data),
        media_type="application/json",
        headers={"Cache-Control": "private, max-age=5"},
    )

@app.get("/api/rates/current")
async def get_current_rates(current_user=Depends(require_subscription)):
    data = await cached_rate_service.get_current_rates()
    try:
        import orjson
        return Response(content=orjson.dumps(data), media_type="application/json")
    except ImportError:
        return data

@app.get("/api/rates/current/{competitor_name}")
async def get_current_rates_by_competitor(
    competitor_name: str, current_user=Depends(require_subscription)
):
    return await cached_rate_service.get_current_rates_by_competitor(competitor_name)

@app.get("/api/rates/export")
async def export_current_rates(current_user=Depends(require_subscription)):
    from fastapi.responses import StreamingResponse
    import io
    csv_data = await cached_rate_service.export_rates_csv()
    return StreamingResponse(
        io.StringIO(csv_data),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=bullion_rates.csv"}
    )

async def authenticate_websocket(websocket: WebSocket):
    """Authenticate WebSocket via JWT cookie or JWT query param.

    Returns (user_id, jti, is_admin) tuple, or (None, None, False) on failure.
    """
    from urllib.parse import parse_qs
    from .services.auth import AuthService, AuthError

    token = None
    cookies = websocket.cookies
    if cookies and 'auth_token' in cookies:
        token = cookies['auth_token']
    if not token:
        query_params = parse_qs(str(websocket.url.query))
        token = query_params.get('token', [None])[0]
    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        return None, None, False

    try:
        payload = AuthService.validate_jwt_token(token)
        jti = payload.get('jti')
        return payload['user_id'], jti, payload.get('is_admin', False)
    except AuthError:
        pass

    await websocket.close(code=4001, reason="Authentication required")
    return None, None, False

@app.websocket("/ws/rates")
async def websocket_rates(websocket: WebSocket):
    logger.info(f"WebSocket connection attempt from: {websocket.client}")
    ws_user_id = None
    ws_id = None
    try:
        await websocket.accept()
        user_id, jti, is_admin = await authenticate_websocket(websocket)
        if not user_id:
            return
        ws_user_id = user_id

        # Session validation (skip if no jti — graceful rollout)
        if jti:
            from .services.session_service import SessionService
            if is_admin:
                valid = await SessionService.validate_admin_session(user_id, jti)
            else:
                valid = await SessionService.validate_session(user_id, jti)
            if not valid:
                await websocket.close(code=4007, reason="Session invalidated")
                return

        from .services.auth import AuthService
        user = await AuthService.get_user_by_id(user_id)
        if not user:
            await websocket.close(code=4001, reason="User not found")
            return
        if not await is_access_allowed(user_id, user.is_admin, user.onboarding_complete):
            await websocket.close(code=4003, reason="Subscription required")
            return

        # Enforce per-user connection limit
        from .services.ws_connection_registry import WSConnectionRegistry
        allowed, ws_id = await WSConnectionRegistry.register(user_id)
        if not allowed:
            await websocket.close(code=4008, reason="Too many connections")
            return

        websocket_manager.register(websocket, user_id=user_id)
        await websocket.send_text('{"type": "connected", "message": "WebSocket connected successfully"}')

        last_recheck = time.monotonic()

        try:
            while True:
                try:
                    await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                except asyncio.TimeoutError:
                    # Refresh WS registry entry to prove this connection is alive.
                    # Without this, the sorted-set entry expires after 90s and the
                    # slot opens for a new connection — which is correct for dead
                    # pods but wrong for live connections.
                    if ws_id:
                        await WSConnectionRegistry.refresh(ws_user_id, ws_id)
                except WebSocketDisconnect:
                    break

                # Re-check access every 60s to evict expired preview / cancelled subs
                if (time.monotonic() - last_recheck) >= WS_RECHECK_INTERVAL:
                    last_recheck = time.monotonic()
                    try:
                        ws_user = await AuthService.get_user_by_id(user_id)
                        if not ws_user or not await is_access_allowed(
                            user_id, ws_user.is_admin, ws_user.onboarding_complete
                        ):
                            await websocket.close(code=4003, reason="Access revoked")
                            break
                    except Exception as e:
                        logger.warning(f"WebSocket recheck error for {user_id}: {e}")
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
    finally:
        websocket_manager.disconnect(websocket, user_id=ws_user_id)
        if ws_user_id and ws_id:
            from .services.ws_connection_registry import WSConnectionRegistry
            await WSConnectionRegistry.unregister(ws_user_id, ws_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
