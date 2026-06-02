"""
SecurityHeaderMiddleware — runs on every request.

Responsibilities:
- Extract client IP from CF-Connecting-IP / X-Forwarded-For / client.host
- Validate Host header against ALLOWED_HOSTS
- Block /metrics, /docs, /redoc, /openapi.json unless internal secret provided
- Detect datacenter IPs via cloud_ip_detector
- Set request.state for downstream middleware
"""

import os
import logging
from ipaddress import ip_address as _parse_ip, ip_network as _parse_net

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.services.cloud_ip_detector import is_datacenter_ip

logger = logging.getLogger(__name__)

# Env-configurable
_NOT_LOADED = object()
_ALLOWED_HOSTS: set[str] | None | object = _NOT_LOADED
_INTERNAL_SECRET: str | None | object = _NOT_LOADED

# Blocked paths (return 404 without internal secret)
_BLOCKED_PATHS = {"/metrics", "/docs", "/redoc", "/openapi.json"}

# Trusted proxy networks — only trust X-Forwarded-For from these sources
_TRUSTED_PROXY_NETS = [
    _parse_net("127.0.0.0/8"),
    _parse_net("10.0.0.0/8"),
    _parse_net("172.16.0.0/12"),
    _parse_net("192.168.0.0/16"),
    _parse_net("::1/128"),
    _parse_net("fc00::/7"),
]


def _is_trusted_proxy(ip_str: str) -> bool:
    """Check if an IP is a known trusted proxy (private/loopback)."""
    try:
        addr = _parse_ip(ip_str)
        return any(addr in net for net in _TRUSTED_PROXY_NETS)
    except ValueError:
        return False


def _get_allowed_hosts() -> set[str] | None:
    global _ALLOWED_HOSTS
    if _ALLOWED_HOSTS is _NOT_LOADED:
        raw = os.getenv("ALLOWED_HOSTS", "")
        _ALLOWED_HOSTS = {h.strip().lower() for h in raw.split(",") if h.strip()} or None
    return _ALLOWED_HOSTS


def _get_internal_secret() -> str | None:
    global _INTERNAL_SECRET
    if _INTERNAL_SECRET is _NOT_LOADED:
        raw = os.getenv("INTERNAL_API_SECRET", "")
        _INTERNAL_SECRET = raw or None
    return _INTERNAL_SECRET


class SecurityHeaderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # ── Extract client IP ───────────────────────────────
        cf_ray = request.headers.get("cf-ray")
        if cf_ray:
            client_ip = request.headers.get("cf-connecting-ip", "")
        else:
            client_ip = ""

        if not client_ip:
            direct_ip = request.client.host if request.client else "127.0.0.1"
            forwarded = request.headers.get("x-forwarded-for", "")
            if forwarded and _is_trusted_proxy(direct_ip):
                # Only trust XFF when the direct connection is from a known proxy
                client_ip = forwarded.split(",")[0].strip()
            else:
                client_ip = direct_ip

        # ── Host validation ─────────────────────────────────
        allowed = _get_allowed_hosts()
        path = request.url.path
        if allowed:
            host = request.headers.get("host", "").split(":")[0].lower()
            # Bypass for localhost, internal metrics, and health probes
            is_internal = client_ip in ("127.0.0.1", "::1") or client_ip.startswith("10.42.")
            is_infra_path = path in ("/metrics", "/health")
            if not is_internal and not is_infra_path and host not in allowed:
                return JSONResponse(
                    status_code=421,
                    content={"detail": "Misdirected request"},
                )

        # ── Block sensitive paths ───────────────────────────
        if path in _BLOCKED_PATHS:
            secret = _get_internal_secret()
            if secret:
                provided = request.headers.get("x-internal-secret", "")
                if provided != secret:
                    return JSONResponse(status_code=404, content={"detail": "Not found"})
            # If no secret configured, allow through (dev mode)

        # ── Cloud IP detection ──────────────────────────────
        is_dc, dc_provider = is_datacenter_ip(client_ip)

        # ── Set request.state ───────────────────────────────
        request.state.client_ip = client_ip
        request.state.is_datacenter = is_dc
        request.state.dc_provider = dc_provider
        request.state.cf_country = request.headers.get("cf-ipcountry", "")
        request.state.cf_ray = cf_ray or ""

        return await call_next(request)
