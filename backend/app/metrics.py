"""
Custom Prometheus metrics for scraper monitoring and APM.

Exposed alongside the default FastAPI metrics at /metrics.
"""

from prometheus_client import Gauge, Counter, Histogram, Info

# ---------------------------------------------------------------------------
# Scraper metrics
# ---------------------------------------------------------------------------

SCRAPER_LAST_UPDATE = Gauge(
    "scraper_last_update_timestamp_seconds",
    "Unix timestamp of the last rate update received from this scraper",
    ["scraper"],
)

SCRAPER_FRESHNESS = Gauge(
    "scraper_freshness_seconds",
    "Seconds since the last rate update from this scraper (lower = fresher)",
    ["scraper"],
)

SCRAPER_HEALTHY = Gauge(
    "scraper_healthy",
    "Whether this scraper is considered healthy (1=yes, 0=no)",
    ["scraper"],
)

SCRAPER_RUNNING = Gauge(
    "scraper_running",
    "Whether this scraper task is running (1=yes, 0=no)",
    ["scraper"],
)

SCRAPER_RESTARTS = Gauge(
    "scraper_restarts_last_hour",
    "Number of restarts in the last hour for this scraper",
    ["scraper"],
)

RATE_UPDATES_TOTAL = Counter(
    "rate_updates_total",
    "Total number of rate update batches processed",
    ["competitor"],
)

RATE_UPDATES_SCRIPTS = Counter(
    "rate_updates_scripts_total",
    "Total number of individual script rates processed",
    ["competitor"],
)

HEARTBEATS_TOTAL = Counter(
    "heartbeats_total",
    "Total heartbeat messages sent (unchanged rates)",
    ["competitor"],
)

# ---------------------------------------------------------------------------
# WebSocket metrics
# ---------------------------------------------------------------------------

WEBSOCKET_CONNECTIONS = Gauge(
    "websocket_connections_active",
    "Number of active WebSocket connections",
)

WEBSOCKET_MESSAGES_SENT = Counter(
    "websocket_messages_sent_total",
    "Total WebSocket messages broadcast",
)

# ---------------------------------------------------------------------------
# Broadcast efficiency
# ---------------------------------------------------------------------------

BROADCAST_EFFICIENCY = Histogram(
    "broadcast_reduction_ratio",
    "Ratio of data saved by differential broadcasting (0-1)",
    buckets=[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
)

# ---------------------------------------------------------------------------
# System metrics
# ---------------------------------------------------------------------------

COMPETITORS_WITH_DATA = Gauge(
    "competitors_with_data",
    "Number of competitors with active rate data in memory",
)

REDIS_PUBSUB_RECONNECTS = Counter(
    "redis_pubsub_reconnects_total",
    "Number of Redis pub/sub reconnection attempts",
)

# ---------------------------------------------------------------------------
# Dealer intelligence metrics (taxonomy + registry)
# ---------------------------------------------------------------------------

DEALER_TOTAL = Gauge(
    "dealer_total",
    "Total registered dealers",
)

DEALER_COUNT_BY_TYPE = Gauge(
    "dealer_count_by_type",
    "Dealer count per scraper type",
    ["scraper_type"],
)

DEALER_CITIES_TOTAL = Gauge(
    "dealer_cities_total",
    "Unique cities covered by at least one dealer",
)

DEALER_SCRIPTS_TOTAL = Gauge(
    "dealer_scripts_total",
    "Total classified rate scripts across all dealers",
)

TAXONOMY_SCRIPTS_BY_COMMODITY = Gauge(
    "taxonomy_scripts_by_commodity",
    "Script count per commodity",
    ["commodity"],
)

TAXONOMY_SCRIPTS_BY_PURITY = Gauge(
    "taxonomy_scripts_by_purity",
    "Script count per commodity and purity",
    ["commodity", "purity"],
)

TAXONOMY_DEALERS_BY_CITY = Gauge(
    "taxonomy_dealers_by_city",
    "Dealer count per city",
    ["city"],
)

TAXONOMY_SCRIPTS_BY_WEIGHT = Gauge(
    "taxonomy_scripts_by_weight",
    "Script count per weight tier",
    ["weight"],
)

TAXONOMY_SCRIPTS_BY_FORM = Gauge(
    "taxonomy_scripts_by_form",
    "Script count per physical form",
    ["form"],
)

DEALER_INFO = Gauge(
    "dealer_info",
    "Dealer registry entry (value=script count, metadata in labels)",
    ["dealer", "city", "state", "scraper_type"],
)

DEALER_SCRIPT_TAXONOMY = Gauge(
    "dealer_script_taxonomy",
    "Per-script taxonomy classification (value=1, metadata in labels)",
    ["dealer", "script_name", "commodity", "purity", "weight", "city", "form", "delivery", "gst"],
)
