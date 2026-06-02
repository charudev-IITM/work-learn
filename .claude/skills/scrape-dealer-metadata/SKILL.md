---
description: Scrape metadata (logo, name, city, address, email, phone, WhatsApp) from onboarded dealer websites and store in PostgreSQL + Redis
user_invocable: true
---

# Scrape Dealer Metadata

Scrapes website metadata from all onboarded bullion dealers and stores results in PostgreSQL and Redis.

## What it does

Fetches homepage + contact pages from dealer websites and extracts:
- Logo URL
- Company name
- City & State
- Address
- Email(s)
- Phone numbers (normalized Indian format)
- WhatsApp number
- Social media links

## Usage

```
/scrape-dealer-metadata                     # All dealers
/scrape-dealer-metadata kjbullion ronakgold  # Specific dealers
/scrape-dealer-metadata --json              # Output JSON only, no storage
```

## Instructions

1. Parse the user's arguments to determine which dealers to scrape (default: all).

2. Run the scraper script with appropriate flags:

```bash
# All dealers with storage (Playwright fallback is ON by default)
DATABASE_URL="postgresql://postgres:password@localhost:5454/bullion_intel" \
REDIS_URL="redis://localhost:6666/0" \
python3 backend/scripts/scrape_dealer_metadata.py --store --no-print

# Specific dealers with storage
DATABASE_URL="postgresql://postgres:password@localhost:5454/bullion_intel" \
REDIS_URL="redis://localhost:6666/0" \
python3 backend/scripts/scrape_dealer_metadata.py dealer1 dealer2 --store --no-print

# Fast mode without Playwright (urllib only, faster but misses JS sites)
DATABASE_URL="postgresql://postgres:password@localhost:5454/bullion_intel" \
REDIS_URL="redis://localhost:6666/0" \
python3 backend/scripts/scrape_dealer_metadata.py --no-playwright --store --no-print

# JSON output only (no storage)
python3 backend/scripts/scrape_dealer_metadata.py --pretty

# Save to file
python3 backend/scripts/scrape_dealer_metadata.py -o dealer_metadata.json --pretty
```

3. If running inside Docker (production), use internal hostnames:
```bash
DATABASE_URL="postgresql://postgres:password@postgres:5432/bullion_intel" \
REDIS_URL="redis://redis:6379/0"
```

4. Report the summary stats after completion:
   - Total dealers scraped
   - How many have: name, logo, city, address, email, phone, WhatsApp

## Storage Details

- **PostgreSQL**: `dealer_metadata` table with UPSERT (preserves existing data for fields that come back empty on re-scrape)
- **Redis**: `dealer:metadata:{dealer_id}` hashes for fast API access, plus `dealer:metadata:all` set for listing

## Script Location

`backend/scripts/scrape_dealer_metadata.py`

## CLI Flags

| Flag | Description |
|------|-------------|
| `dealers` | Positional args: specific dealer names (default: all) |
| `--store` | Store results in PostgreSQL and Redis |
| `--no-print` | Suppress JSON output (use with --store) |
| `--output FILE` | Save JSON to file |
| `--pretty` | Pretty-print JSON |
| `--workers N` | Concurrent workers (default: 10) |
| `--no-playwright` | Skip Playwright fallback (faster, but misses JS-rendered sites) |
| `--import-json FILE` | Import pre-scraped JSON and store (skip scraping) |
