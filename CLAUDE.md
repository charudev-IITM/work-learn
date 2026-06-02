# CLAUDE.md

## Project Overview

**SpotCompare** — Real-time bullion dealer rate comparison SaaS. Scrapes 149+ Indian bullion dealers, streams live rates via WebSocket, and provides watchlists, price alerts, a formula calculator, news aggregation, and an AI agent (Goldie).

- **Users**: 99% mobile — always test mobile-first

### Domains & Environments

| Domain | What | Stack | Deploy |
|--------|------|-------|--------|
| `spotcompare.com` / `www.spotcompare.com` | Production marketing site | Next.js → Vercel | Vercel production |
| `stage.spotcompare.com` | Staging marketing site | Next.js → Vercel (Preview) | Vercel preview branch |
| `app.spotcompare.com` | Production web app | React + Vite → K3s | Push to `main` branch |
| `staging.spotcompare.com` | Staging web app | React + Vite → K3s (staging namespace) | Push to `staging` branch |
| `ops.spotcompare.com` | Admin panel | React + Vite → K3s | Push to `main` branch |
| `ops-staging.spotcompare.com` | Staging admin panel | React + Vite → K3s (staging namespace) | Push to `staging` branch |

**Web app** (frontend/ + backend/), **admin panel** (admin/), and **marketing site** (website/) are separate deployments.

## Monorepo Structure

```
comp-intel/
├── backend/          # Python FastAPI — API, scrapers, workers
├── frontend/         # React + Vite — main web app
├── admin/            # React + Vite — admin panel (ops.spotcompare.com)
├── mobile/           # Expo React Native — iOS/Android app (scaffolding only)
├── website/          # Next.js — marketing site (Vercel)
├── packages/shared/  # TypeScript shared types + calculator evaluator
├── infrastructure/   # K3s manifests, Docker configs, deploy scripts
├── docker/           # Dockerfiles (dev + production)
└── .github/workflows # CI/CD pipelines
```

npm workspaces: `["packages/*", "frontend", "mobile", "admin"]` — backend is Python, not in workspaces.

## Quick Start (Development)

```bash
./scripts/start-dev.sh     # Start all services via docker-compose
./scripts/stop-dev.sh      # Stop all services
docker-compose logs -f backend        # Backend logs
docker-compose logs -f scraper-worker # Scraper logs
```

| Service | URL | Port |
|---------|-----|------|
| Frontend | http://localhost:3333 | 3333 |
| Admin Panel | http://localhost:3334 | 3334 |
| Backend API | http://localhost:8888/docs | 8888 |
| PostgreSQL | localhost:5454 | 5454→5432 |
| Redis | localhost:6666 | 6666→6379 |
| Meilisearch | http://localhost:7700 | 7700 |
| Redis Commander | http://localhost:8181 | 8181 (profile: debug) |

**Dev login (frontend)**: Phone `9600088158`, OTP `0000` (dev bypass when `DEV_OTP_BYPASS` is set)

**Dev login (admin panel)**: Username `admin`, password `admin123`

**Staging login (admin panel)**: Username `ops-admin`, password `Sc0mp4r3-St4g1ng#2026` (at `ops-staging.spotcompare.com`, behind staging basic auth)

## Commands

### Backend
```bash
cd backend && pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend
```bash
cd frontend && npm install
npm run dev       # Vite dev server (port 3333)
npm run build     # Production build (catches TS errors)
npm run lint      # ESLint
```

### Mobile (Expo)
```bash
cd mobile && npm install
npm start         # Expo dev server
npm run ios       # iOS simulator
npm run android   # Android simulator
```

### Website (Next.js)
```bash
cd website && npm install
npm run dev       # Next.js dev server
npm run build     # Production build
```

### Deployment
```bash
/ship                                          # Commit, push, deploy to production
./infrastructure/k3s/deploy.sh                 # Full production deploy (build + push + apply)
./infrastructure/k3s/deploy.sh --env staging   # Full staging deploy
./infrastructure/k3s/deploy.sh --apply-only    # Apply manifests only (no build)
./infrastructure/k3s/deploy.sh --build-only    # Build and push images only
```

## Architecture

### Backend (FastAPI)

**Entry point**: `backend/app/main.py` — always runs in `DEPLOY_MODE=api` (scrapers run as separate worker process)

**12 API routers** in `backend/app/api/`:

| Router | Path | Purpose |
|--------|------|---------|
| auth | /api/auth | Phone OTP login (MSG91), legacy admin auth |
| rates | /api/rates | Public current rates |
| watchlist | /api/watchlist | Per-user watchlist CRUD |
| alerts | /api/alerts | Price alert rules + delivery |
| calculator | /api/calculator | Formula builder + evaluation |
| news | /api/news | News articles + Meilisearch search |
| agent | /api/agent | Goldie AI chat (Groq LLM) |
| onboarding | /api/onboarding | Multi-step setup wizard, taxonomy classification |
| billing | /api/billing | Razorpay subscriptions |
| dealers | /api/dealers | Dealer metadata |
| dealer-requests | /api/dealer-requests | Dealer addition requests |
| admin | /api/admin | User management, analytics, broadcast, audit logs |

**Workers** (separate processes):
- `backend/scraper_worker.py` — runs all scrapers via `AsyncRateService`, publishes rates to Redis
- `backend/news_worker.py` — fetches MoneyControl, Reuters, + Google News, indexes to Meilisearch every 5m

### Scraper System (149+ dealers)

| Type | Count | Config File | How to Add |
|------|-------|-------------|------------|
| VOTS | 107 | `scrapers/vots/vots_scraper.py` → `VOTS_DEALERS` | Add 3-line dict entry |
| WinBull | 14 | `scrapers/winbull/winbull_scraper.py` → `WINBULL_DEALERS` | Add 3-line dict entry |
| Socket.IO | 25 | `scrapers/socketio/socketio_scraper.py` → `SOCKETIO_DEALERS` | Add 3-line dict entry |
| Custom | 3 | `scrapers/__init__.py` (csvbullion, rsbl, vasantbullion) | Create scraper class + register |

- **Auto-onboard**: `/onboard-scraper <url>` skill auto-detects API type and generates scraper
- **Registry**: `scrapers/__init__.py` auto-builds from all config dicts + custom scrapers
- **Base classes**: `scrapers/base/` — `BaseScraper`, `APIBaseScraper`, `TabDelimitedAPIScraper`, `RecordTypedAPIScraper`

### Authentication

**Primary flow**: Phone OTP via MSG91
1. `POST /api/auth/send-otp` → sends SMS (Turnstile captcha required)
2. `POST /api/auth/verify-otp` → returns JWT token + user object
3. Frontend stores JWT in localStorage, sends via `Authorization: Bearer` header
4. WebSocket auth: `/ws/rates?token=<jwt>`

**Legacy admin flow**: Username/password signup requires `MASTER_KEY`

**Dev bypass**: Phone `9600088158` + OTP `0000` when `DEV_OTP_BYPASS` is set

### Frontend (React + Vite)

- **UI**: ShadCN/Radix components + TailwindCSS
- **State**: React Context (11 context providers) — NOT Redux
- **WebSocket**: `WatchlistDataContext.tsx` manages authenticated real-time connection
- **Views**: WatchlistView, HomeDashboardView, CalculatorView, NewsView, AlertsView, GoldieChatPanel
- **Shared types**: `@comp-intel/shared` package (path alias `@comp-intel/shared`)
- **DnD**: react-beautiful-dnd for watchlist reordering

### Admin Panel (React + Vite → ops.spotcompare.com)

- Separate React app at `admin/` with its own Dockerfile and K3s manifest (`18-admin.yaml`)
- Features: user management (ban/unban), subscription grants, dealer request review, broadcast announcements, audit log
- Own auth context + JWT login (separate from user phone OTP flow)
- API: `backend/app/api/admin.py` → `/api/admin/*` endpoints

### Mobile (Expo React Native)

- **Status**: Scaffolding only — no source code yet
- Planned: Expo Router, NativeWind, shared types via `@comp-intel/shared`

### Website (Next.js → Vercel)

- Next.js 16 App Router at `website/`
- Marketing/landing pages: compare, features, pricing, FAQ, contact
- Three.js 3D graphics, Framer Motion animations
- Deployed separately to Vercel

## Infrastructure

### Production: K3s 2-Node Cluster

```
Cloudflare CDN (Free) → node-2 (app, 134.209.157.152)
                         ├── Traefik (ingress, hostPort 80/443, pinned to this node)
                         ├── backend ×2 (FastAPI, API mode)
                         └── frontend ×2 (nginx SPA)
                      → node-1 (data, 139.59.79.194)
                         ├── PostgreSQL + PgBouncer
                         ├── Redis
                         ├── Meilisearch
                         ├── scraper-worker ×1
                         └── news-worker ×1
```

- **Region**: BLR1 (Bangalore) — lowest latency for Indian users
- **Registry**: registry.digitalocean.com/comp-intel
- **TLS**: Cloudflare Full (Strict) + Origin CA cert (15-year, wildcard)
- **Monitoring**: Prometheus + Grafana (`15-monitoring.yaml`, `17-grafana-ingress.yaml`)
- **Manifests**: `infrastructure/k3s/` (18 YAML files, numbered 00-18)

### Staging: Same Cluster, Separate Namespace

- **URL**: staging.spotcompare.com
- **Namespace**: `comp-intel-staging` (vs `comp-intel` for production)
- **Dual Redis**: Staging has TWO Redis connections:
  - `redis_manager` (`REDIS_URL`) → local staging Redis (sessions, OTP, cache)
  - `shared_redis` (`SHARED_REDIS_URL`) → production Redis via ACL user (scraper data, pub/sub)
- **Separate**: Own PostgreSQL (emptyDir), PgBouncer, local Redis (emptyDir), backend ×1, frontend ×1
- **Manifests**: `infrastructure/k3s/staging/` (8 YAML files)

### CI/CD (GitHub Actions)

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `ci.yml` | Push (any branch), PR to dev/staging/main | Frontend build + backend syntax check |
| `staging-deploy.yml` | Push to `staging` | CI → SCP code → `deploy.sh --env staging` |
| `production-deploy.yml` | Push to `main` | CI → approval gate → SCP code → `deploy.sh` |

**Git branching**: `dev` → `staging` → `main` (always merge forward, never push directly to staging/main)
- All development work happens on `dev` (or feature branches merged into `dev`)
- To deploy staging: merge `dev` into `staging`
- To deploy production: merge `staging` into `main`

### Development: Docker Compose

- `docker-compose.dev.yml` — 7 services (backend, scraper-worker, frontend, postgres, redis, meilisearch, news-worker)
- Hot-reload: backend (uvicorn --reload), frontend (Vite HMR), shared package (volume mount)
- Use `docker compose up -d` (NOT `restart`) when changing env vars — restart doesn't re-read compose file

## Key Files

### Backend
| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI entry point, router registration, WebSocket handler |
| `backend/scrapers/__init__.py` | Unified scraper registry (auto-discovers all types) |
| `backend/scrapers/vots/vots_scraper.py` | VOTS config-driven scraper + `VOTS_DEALERS` dict |
| `backend/app/database/connection.py` | Redis + DB connection managers, `shared_redis` dual-Redis for staging |
| `backend/app/services/cached_rate_service.py` | WebSocket broadcasting, hash dedup, heartbeat (subscribes via `shared_redis`) |
| `backend/app/api/auth.py` | Phone OTP + legacy admin auth endpoints |
| `backend/app/services/agent_service.py` | Goldie AI agent (Groq API) |
| `backend/app/services/rate_taxonomy.py` | Rate taxonomy classifier (1127 LOC), SONA fast path |
| `backend/app/services/async_rate_service.py` | Scraper orchestration engine (used by scraper_worker) |
| `backend/app/database/models.py` | SQLAlchemy ORM models (16 models) |
| `backend/scraper_worker.py` | Scraper process manager |
| `backend/news_worker.py` | News fetcher (MoneyControl + Reuters) |

### Frontend
| File | Purpose |
|------|---------|
| `frontend/src/contexts/AuthContext.tsx` | JWT auth state + phone OTP flow |
| `frontend/src/contexts/WatchlistContext.tsx` | User watchlist state |
| `frontend/src/contexts/WatchlistDataContext.tsx` | Authenticated WebSocket provider |
| `frontend/src/components/watchlist/WatchlistApp.tsx` | Main watchlist UI |
| `frontend/src/components/goldie/` | AI agent chat interface |
| `frontend/src/services/auth.ts` | JWT token management, API client |

### Infrastructure
| File | Purpose |
|------|---------|
| `infrastructure/k3s/deploy.sh` | Build → push → apply → restart → health check |
| `infrastructure/k3s/setup-cluster.sh` | One-time K3s cluster setup |
| `infrastructure/k3s/12-ingress.yaml` | Traefik routing (/api, /ws, /health → backend; / → frontend) |
| `infrastructure/k3s/10-backend.yaml` | Backend deployment (replicas, probes, env vars) |

## Database

**PostgreSQL 15** — database: `bullion_intel` (prod), `bullion_intel_staging` (staging)

**14 migrations** in `backend/migrations/`:
001_phone_auth, 002_price_alerts, 003_news_articles, 003_user_formulas, 004_news_image_url, 005_dealer_metadata, 006_onboarding, 007_agent_query_log, 008_layout_mode, 009_agent_token_tracking, 010_user_sessions, 011_abuse_log, 012_admin_ban_fields, 013_admin_audit_log

Migrations are applied manually via `psql` — no auto-migration framework.

## Environment Variables

**Required for backend** (set in docker-compose.dev.yml or K3s secrets):

| Variable | Dev Default | Purpose |
|----------|-------------|---------|
| `DATABASE_URL` | `postgresql://postgres:password@postgres:5432/bullion_intel` | PostgreSQL connection |
| `REDIS_URL` | `redis://redis:6379` | Redis connection |
| `SHARED_REDIS_URL` | (staging only) | Production Redis for scraper data. Uses ACL user `staging`. Not set in dev/prod (falls back to `REDIS_URL`). See `connection.py:shared_redis` |
| `JWT_SECRET` | `dev_jwt_secret_456!` | JWT signing key |
| `MASTER_KEY` | `super_secret_master_key_123!` | Admin signup restriction |
| `MEILISEARCH_URL` | `http://meilisearch:7700` | Search engine |
| `MEILISEARCH_MASTER_KEY` | `meili_dev_key_123` | Meilisearch auth |
| `GROQ_API_KEY` | (optional) | Goldie AI agent |
| `MSG91_AUTH_KEY` | (optional) | SMS OTP delivery |
| `MSG91_TEMPLATE_ID` | (optional) | SMS template |
| `DEV_OTP_BYPASS` | (optional) | Skip SMS in dev |
| `RAZORPAY_KEY_ID` | test key | Payment gateway |
| `RAZORPAY_KEY_SECRET` | test key | Payment gateway |
| `TURNSTILE_SECRET_KEY` | (prod only) | Cloudflare captcha |

## Gotchas & Non-Obvious Patterns

### Rate Broadcasting
- `cached_rate_service.handle_new_rates()` has hash-based dedup — skips broadcast when rate VALUES are unchanged
- **Heartbeat** (30s): when rates are static, sends `{"type":"heartbeat","competitor":"...","timestamp":"..."}` instead of full data
- Frontend `WatchlistDataContext` handles heartbeats via `refreshCompetitorTimestamps()` in rateStore
- Individual scrapers must NOT have their own dedup returning `[]` — central `handle_new_rates` handles it

### Redis Connection Scaling
- `connection.py` uses `BlockingConnectionPool` — queues during bursts instead of "Too many connections"
- Pool size scales with scraper count: ~50 connections supports ~80 scrapers
- Each Socket.IO reader does SMEMBERS+MGET every 2s — needs pool connections
- All scrapers heartbeat simultaneously (~30s) — blocking pool smooths the burst

### Post-Change Verification (CRITICAL)
After ANY backend/scraper changes:
1. `curl /api/rates/current` — check ALL competitor timestamps <35s old
2. `curl /health` — confirm all scrapers in `active_scrapers`
3. Wait **60 seconds**, re-check — hash dedup may mask stale scrapers initially
4. Open frontend — "Live" indicator should show recent timestamps
5. Use `docker compose up -d` (not `restart`) for env var changes
6. Check `docker compose logs backend | grep "Too many connections"` for Redis pool issues

### Staging Dual-Redis
- Staging uses two Redis connections: local `redis_manager` for app state, `shared_redis` for production scraper data
- `shared_redis` authenticates to production Redis as ACL user `staging` (read-only + pubsub, no publish)
- **ACL is defined in** `infrastructure/k3s/02-configmap.yaml` (production Redis config) — NOT in staging manifests
- **After adding/changing the ACL**: you MUST restart production Redis (`kubectl rollout restart statefulset/redis -n comp-intel`) — the deploy script does NOT restart Redis
- **After changing `SHARED_REDIS_URL` secret**: restart staging backend (`kubectl rollout restart deployment/backend -n comp-intel-staging`)
- **Symptom of broken shared_redis**: backend logs show `Redis pub/sub not available, retrying`, `/health` returns `competitors_with_data: 0`, onboarding dealer list is empty
- Code: `backend/app/database/connection.py` — `shared_redis` instance is created when `SHARED_REDIS_URL != REDIS_URL`

### Multi-Agent Git Safety
- **NEVER use `git stash`** when other Claude instances have uncommitted changes in the same repo — stash+branch-switch+pop can silently lose changes
- For merge-forward (dev → staging → main) with a dirty working tree, use `git worktree add /tmp/ship staging` instead of local checkout
- Always ask the user before any destructive git operation when multiple agents share the repo

### K3s/Traefik
- Traefik MUST be pinned to app node (nodeSelector: node-role=app) — hostPort only binds on the pod's node, and Cloudflare DNS points to node-2
- Use `pathType: Prefix` (not `Exact`) for Traefik v3 ingress rules — `Exact` has priority bugs with catch-all `/`
- K3s probe Host headers must match `ALLOWED_HOSTS` — otherwise TrustedHostMiddleware returns 421

## Common Tasks

| Task | How |
|------|-----|
| Add VOTS scraper | Add 3-line entry to `VOTS_DEALERS` in `backend/scrapers/vots/vots_scraper.py` |
| Add custom scraper | Create class in `backend/scrapers/`, register in `__init__.py` |
| Auto-detect scraper | `/onboard-scraper <url>` skill |
| Deploy to production | Merge `staging` into `main` (triggers GitHub Actions) |
| Deploy to staging | Merge `dev` into `staging` (triggers GitHub Actions) |
| Apply K3s manifests | `./infrastructure/k3s/deploy.sh --apply-only` |
| Run mobile app | `cd mobile && npm start` |
| Check prod health | `curl https://spotcompare.com/health` |
| Check staging health | `curl https://staging.spotcompare.com/health` |
| View prod pods | `KUBECONFIG=~/.kube/k3s-config kubectl get pods -n comp-intel` |
| View staging pods | `KUBECONFIG=~/.kube/k3s-config kubectl get pods -n comp-intel-staging` |
| Backend logs (K3s) | `kubectl logs deploy/backend -n comp-intel --tail=50` |

## Development Guidelines

- **Playwright E2E testing**: When testing onboarding/preview flows, always create or reset a fresh user — existing users may have `onboarding_complete=True` and skip the flow entirely. Reset via: DB (`UPDATE users SET onboarding_complete=false`), Redis (`DEL onboarding:state:{id}`, `DEL preview:timer:{id}`), and watchlists (`DELETE FROM user_watchlist_scripts/user_watchlists`)
- **NEVER write directly to Redis to simulate app state** (e.g., `redis-cli SET "platform_settings:..."`) — this bypasses TTL and cache invalidation, leaving stale data that persists forever and breaks the app. Use the API endpoints instead (e.g., `PUT /api/admin/platform-settings/{key}`). The only safe Redis operation for test cleanup is `DEL` (deleting keys).
- Test all UI changes in **mobile viewports first** (99% mobile users)
- Use ShadCN UI components + TailwindCSS for styling
- Use React Context for state — avoid direct mutation
- Use existing patterns from `components/watchlist/` for new features
- Shared types go in `packages/shared/src/types/`
- Never assume library availability — check existing imports
- Import shared code via `@comp-intel/shared` path alias

# Playwright MCP

When reconnecting to a browser fails, close the existing browser and retry.

**Dev login for localhost:3333**: Phone `9600088158`, OTP `0000` (dev bypass).
