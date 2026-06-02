"""Shared constants used across backend modules."""

# Redis pub/sub channel for rate updates (scraper-worker → API workers)
RATE_UPDATES_CHANNEL = "rate_updates"

# Redis pub/sub channel for admin broadcasts (admin endpoint → all API workers)
ADMIN_BROADCAST_CHANNEL = "admin_broadcast"
