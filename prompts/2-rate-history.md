You are building a Rate History and Charts feature for SpotCompare — a real-time bullion dealer rate comparison SaaS. Backend is FastAPI with PostgreSQL and Redis. Frontend is React TypeScript. 16+ dealers, 50+ scripts, rates update every second via WebSocket.

## Your Mission
Interview me to clarify requirements, then plan and build this feature end-to-end.

## Feature Vision
Currently, SpotCompare only shows live rates — all historical data is lost. This feature stores rate history and provides interactive charts so users can:
- View intraday rate charts for any script at any dealer (line or candlestick)
- See daily OHLC (open/high/low/close) summaries per script per dealer
- Compare which dealer had the best Gold 999 rate this week
- View dealer reliability metrics (uptime percent, avg staleness, update frequency)
- Export historical data (CSV) for Elite tier users

Key considerations:
- 16 dealers x ~5 scripts each x 1 update/second = ~80 writes/second. Need efficient time-series storage (PostgreSQL with TimescaleDB, downsampling, aggregation tables)
- Tiered access: Pro = 7 days, Elite = 90 days, basic chart only for Starter
- Charts must work great on mobile (99 percent mobile users)
- Charting library: lightweight, touch-friendly (lightweight-charts by TradingView, Recharts, or uPlot)

## Interview Me First
Before writing any code, interview me about:
- Storage strategy: TimescaleDB extension vs raw PostgreSQL with partitioning vs separate time-series DB
- Retention policy: how long to keep raw 1-second data vs downsampled 1-minute/5-minute/1-hour data
- Chart interactions needed on mobile (pinch zoom, time range selector, tap for exact value)
- Which comparisons matter most (same script across dealers or same dealer across scripts)
- Performance budget: acceptable query latency for chart data

## Process
1. Interview me with 3-5 questions per round until requirements are clear
2. Use /feature-dev to explore the codebase and architect the solution
3. Plan with clear iterations:
   - Iteration 1: Rate history storage (schema, ingestion pipeline, downsampling jobs)
   - Iteration 2: History API endpoints (time-range queries, OHLC aggregation, dealer comparison)
   - Iteration 3: Frontend chart components (mobile-first interactive charts)
   - Iteration 4: Tier-based access controls and data export
4. Implement each iteration, using sub-agents for parallel work (e.g., backend storage + frontend charting in parallel)
5. Use /code-review after each iteration
6. Write tests: unit tests for aggregation logic, API tests for time-range queries and tier enforcement, Playwright MCP e2e tests (navigate to chart, verify data renders, interact with chart, verify tier restrictions)

## Completion Promise
The feature is DONE when:
- Rate history is being stored with configurable retention and downsampling
- Interactive mobile-friendly charts render for any script/dealer combination
- OHLC daily summaries are computed and queryable
- Dealer comparison view works (best rate this week across dealers)
- Tier-based access is enforced (data range limits, export restrictions)
- Storage is sustainable (downsampling prevents DB bloat at 80 writes/sec)
- All tests pass (unit, API, e2e with Playwright MCP)
- Code review passes with no high-severity issues

## Key Files to Study First
- backend/app/services/cached_rate_service.py — where rate data flows (hook ingestion here)
- backend/app/services/differential_broadcast_manager.py — rate update pipeline
- backend/app/database/models.py — existing models and DB patterns
- backend/app/database/connection.py — DB connection setup
- frontend/src/stores/rateStore.ts — client-side rate data structure
- frontend/src/components/watchlist/WatchlistDisplay.tsx — where chart UI integrates
- infrastructure/postgres/postgresql.conf — PostgreSQL config (for extension setup)
- infrastructure/docker-compose.prod.yml — infrastructure setup
