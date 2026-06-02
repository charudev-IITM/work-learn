#!/bin/bash
# Scrape dealer metadata and store in PostgreSQL + Redis
# Runs inside the backend Docker container (which has psql, redis-cli, and all Python deps)
#
# Install: add to crontab on the production server:
#   0 3 * * 0  /opt/comp-intel/infrastructure/cron/dealer-metadata.sh >> /var/log/dealer-metadata.log 2>&1
#
# Runs weekly (Sunday 3am) — metadata doesn't change often

set -euo pipefail

COMPOSE_DIR="/opt/comp-intel/infrastructure"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.prod.yml"
COMPOSE_CMD="docker compose"

# Fallback to docker-compose if needed
if ! docker compose version > /dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
fi

echo "[$(date)] Starting dealer metadata scrape..."

# Run the scraper inside the backend container
# Uses --store to write to PostgreSQL + Redis
# No --playwright in production (no browser needed, urllib covers 95%)
$COMPOSE_CMD -f "$COMPOSE_FILE" exec -T backend \
    python /app/scripts/scrape_dealer_metadata.py --store --no-print

echo "[$(date)] Dealer metadata scrape complete"
