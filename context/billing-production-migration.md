# Billing Module - Production Migration Guide

## Overview

This document covers everything needed to take the Razorpay billing/subscription system from development to production.

---

## Pre-Deployment Checklist

### 1. Razorpay Account Setup (Live Mode)

- [ ] **Activate Live Mode** on [Razorpay Dashboard](https://dashboard.razorpay.com)
- [ ] Complete **KYC verification** (required for live payments)
- [ ] Enable the **Subscriptions** product in Dashboard → Settings → Products
- [ ] Generate **Live API Keys** (Dashboard → Settings → API Keys)
  - You'll get a `rzp_live_*` key ID and secret (different from `rzp_test_*`)
- [ ] Set up **Webhook** in live mode:
  - URL: `https://yourdomain.com/api/billing/webhook`
  - Events: `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`
  - Copy the generated **Webhook Secret**

### 2. Environment Variables

Add these to `infrastructure/.env` on the production server:

```env
# Razorpay (LIVE mode - NOT test keys!)
RAZORPAY_KEY_ID=rzp_live_XXXXXXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXXXXXXXXXXXXXX
RAZORPAY_WEBHOOK_SECRET=XXXXXXXXXXXXXXXXXXXX

# After first deploy, plans will be auto-created. Copy the logged plan IDs here:
RAZORPAY_PLAN_ID_MONTHLY=plan_XXXXXXXXXXXX
RAZORPAY_PLAN_ID_ANNUAL=plan_XXXXXXXXXXXX
```

### 3. First Deployment Steps

```bash
# 1. SSH into production server
ssh user@your-server

# 2. Pull latest code
cd ~/comp-intel
git pull origin main

# 3. Edit production env file with live Razorpay keys
nano infrastructure/.env
# Add RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET

# 4. Deploy (rebuilds Docker images with razorpay package)
./infrastructure/deploy.sh -d yourdomain.com

# 5. Check logs for plan creation
docker compose -f infrastructure/docker-compose.prod.yml logs backend | grep -i razorpay

# You'll see something like:
#   Created Razorpay plan 'monthly': plan_XXXX
#   Created Razorpay plan 'annual': plan_YYYY
#   WARNING: Set env var RAZORPAY_PLAN_ID_MONTHLY=plan_XXXX

# 6. IMPORTANT: Copy the plan IDs back to .env to prevent re-creation
nano infrastructure/.env
# Add RAZORPAY_PLAN_ID_MONTHLY and RAZORPAY_PLAN_ID_ANNUAL

# 7. Restart to pick up plan IDs from env (faster startup, no API call)
docker compose -f infrastructure/docker-compose.prod.yml restart backend
```

---

## Database Changes

The deploy automatically creates two new tables via `Base.metadata.create_all`:

### `subscriptions` table
| Column | Type | Description |
|--------|------|-------------|
| id | String (PK) | UUID |
| user_id | String (FK → users.id) | One subscription per user (unique) |
| razorpay_subscription_id | String(100) | Razorpay's subscription ID (unique, indexed) |
| razorpay_plan_id | String(100) | Which plan (monthly/annual) |
| plan_type | String(20) | 'monthly' or 'annual' |
| status | String(30) | Subscription lifecycle state |
| current_period_start | DateTime | Start of current billing period |
| current_period_end | DateTime | End of current billing period |
| charge_at | DateTime | Next charge timestamp |
| paid_count | Integer | Number of successful charges |
| created_at / updated_at | DateTime | Timestamps |

### `subscription_events` table
| Column | Type | Description |
|--------|------|-------------|
| id | String (PK) | UUID |
| subscription_id | String (FK) | Links to subscriptions table |
| user_id | String (FK) | Links to users table |
| razorpay_event_id | String(100) | Idempotency key (unique) |
| event_type | String(50) | e.g., `subscription.charged` |
| event_payload | JSON | Full webhook payload for audit |
| processed_at | DateTime | When event was processed |

**No manual migration needed** — tables are created automatically on startup.

---

## API Changes

### New Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/billing/status` | JWT | Get subscription status |
| POST | `/api/billing/create-subscription` | JWT | Create Razorpay subscription |
| POST | `/api/billing/cancel` | JWT | Cancel subscription |
| POST | `/api/billing/webhook` | HMAC | Razorpay webhook (no JWT) |

### Modified Endpoints
All `/api/watchlists/*` and `/api/dealer-requests/*` endpoints now return **HTTP 402** if user has no active subscription. Admin users (`is_admin=True`) are exempt.

### WebSocket
`/ws/rates` now checks subscription status after authentication. Unsubscribed users get disconnected with code `4003`.

---

## Security Considerations

### Webhook Security
- Webhook endpoint uses HMAC-SHA256 signature verification
- `RAZORPAY_WEBHOOK_SECRET` must be set in production
- Webhook returns 200 even on processing errors (prevents Razorpay retries for our bugs)
- Events are deduplicated via `razorpay_event_id` unique constraint

### Key Management
- **Never commit live API keys** — they're in `.env` which is gitignored
- Store keys in production `.env` file only
- The frontend only sees `RAZORPAY_KEY_ID` (public key) — never the secret
- Webhook secret is server-side only

### Cookie Security
- In production, set `secure=True` in `_set_auth_cookie` (auth.py line 97)
- This is already noted as a TODO in the code

---

## Rollback Plan

If billing needs to be disabled urgently:

```bash
# Quick disable: Remove subscription check from watchlist routes
# In backend container, the subscription check is a FastAPI dependency.
# To disable, set an env var and restart:

# Add to .env:
# BILLING_ENABLED=false

# Then in code, require_subscription can check this env var.
# Or simply revert the git commit and redeploy.
```

For a clean rollback:
```bash
cd ~/comp-intel
git revert <billing-commit-hash>
./infrastructure/deploy.sh -d yourdomain.com
```

The `subscriptions` and `subscription_events` tables will remain but won't be used. They can be dropped later if the feature is permanently removed.

---

## Monitoring

### Key metrics to watch
- **Webhook delivery**: Check Razorpay Dashboard → Webhooks for failed deliveries
- **402 responses**: Monitor for unexpected spikes (could indicate cache issues)
- **Redis cache**: `subscription:{user_id}` keys with 5-minute TTL

### Debugging commands
```bash
# Check subscription status for a user
docker exec comp-intel_postgres_1 psql -U postgres bullion_intel -c \
  "SELECT user_id, status, plan_type, current_period_end FROM subscriptions;"

# Check webhook events
docker exec comp-intel_postgres_1 psql -U postgres bullion_intel -c \
  "SELECT event_type, processed_at FROM subscription_events ORDER BY processed_at DESC LIMIT 10;"

# Check Redis cache
docker exec comp-intel_redis_1 redis-cli KEYS "subscription:*"

# Check backend logs for billing errors
docker compose -f infrastructure/docker-compose.prod.yml logs backend | grep -i "razorpay\|billing\|subscription"
```

---

## Switching from Test to Live Mode

| Item | Test Mode | Live Mode |
|------|-----------|-----------|
| Key prefix | `rzp_test_*` | `rzp_live_*` |
| Payments | Simulated (test cards) | Real money charged |
| Webhook URL | ngrok tunnel | Production domain |
| Plans | Created in test mode | Must be re-created in live mode |
| KYC | Not required | Required |

**Important**: Plans created in test mode do NOT carry over to live mode. On first production deploy, new live-mode plans will be auto-created. Copy the new plan IDs to env vars.

---

## Cost Estimate

At Rs 999/month per user with Razorpay's pricing:
- Gateway fee: 2% = Rs 19.98
- Subscription add-on: 0.99% = Rs 9.89
- GST on fees (18%): Rs 5.38
- **Total cost per monthly subscription: ~Rs 35.25 (~3.5%)**

For annual plan at Rs 8,394:
- Total fee per annual charge: ~Rs 294 (~3.5%)
