You are building a Public API Access feature for SpotCompare — a real-time bullion dealer rate comparison SaaS. Backend is FastAPI with PostgreSQL and Redis. Frontend is React TypeScript. 16+ dealers, 50+ scripts, rates update every second.

## Your Mission
Interview me to clarify requirements, then plan and build this feature end-to-end.

## Feature Vision
Expose SpotCompare real-time and historical rate data via a public REST API for power users, trading firms, and developers. This is a premium feature (Elite tier and above) with rate limiting, API key management, usage tracking, and smart integrations.

### Core Requirements
- API Key Management: Users generate/revoke API keys from their dashboard. Multiple keys per account (one for production, one for testing).
- Endpoints:
  - GET /api/v1/rates/live — current rates for all or specific dealers/scripts
  - GET /api/v1/rates/live/dealer/script — single rate
  - GET /api/v1/rates/history — historical rates with time range, interval params
  - GET /api/v1/rates/ohlc — OHLC aggregated data
  - GET /api/v1/dealers — list of available dealers and their scripts
  - GET /api/v1/alerts — manage alerts programmatically (CRUD)
  - WebSocket endpoint for real-time streaming via API key
- Rate Limiting (tiered):
  - Elite: 100 requests/minute, 5000/day
  - Enterprise: 1000 requests/minute, 50000/day, WebSocket streaming
  - Custom: negotiated limits for large clients
- Usage Tracking: Per-key request counts, bandwidth, endpoint breakdown. Dashboard showing usage over time.
- Google Sheets Integration: A Google Sheets add-on or custom function that pulls live rates into a spreadsheet. Traders live in spreadsheets — this is a killer integration.
  - SPOTCOMPARE function for kjbullion, gold999, buy — returns live buy rate
  - SPOTCOMPARE_HISTORY function for historical data range
- Documentation: Auto-generated API docs (OpenAPI/Swagger), with code examples in Python, JavaScript, cURL

## Interview Me First
Before writing any code, interview me about:
- Pricing strategy: is API access a separate add-on, or bundled into Elite/Enterprise tiers
- Google Sheets priority: build the Sheets integration in v1, or as a fast-follow
- WebSocket API: expose the same real-time stream, or a separate filtered stream
- Authentication: API keys only, or also support OAuth2 for third-party integrations
- Rate limit enforcement: Redis-based sliding window or token bucket
- Usage billing: flat tier pricing, or usage-based (pay per request beyond limit)

## Process
1. Interview me with 3-5 questions per round until requirements are clear
2. Use /feature-dev to explore the codebase and architect the solution
3. Plan with clear iterations:
   - Iteration 1: API key model, generation/revocation, key-based auth middleware
   - Iteration 2: Public API endpoints (live rates, dealers list)
   - Iteration 3: Rate limiting (Redis sliding window) and usage tracking
   - Iteration 4: Usage dashboard UI (mobile-first)
   - Iteration 5: Google Sheets integration (Apps Script add-on)
   - Iteration 6: API documentation and developer portal
4. Implement each iteration, using sub-agents for parallel work
5. Use /code-review after each iteration
6. Write tests: unit tests for rate limiting logic, API tests for all endpoints (auth, rate limits, data accuracy), integration tests for Google Sheets functions, Playwright MCP e2e tests (generate API key, make API call, verify response, check usage dashboard, verify rate limit enforcement)

## Completion Promise
The feature is DONE when:
- Users can generate/revoke API keys from their dashboard
- All public API endpoints return correct data with proper auth
- Rate limiting enforces per-tier limits accurately
- Usage tracking records per-key metrics and displays in dashboard
- Google Sheets custom function works with live rate pulls
- API documentation is auto-generated and accessible
- All tests pass (unit, API, integration, e2e with Playwright MCP)
- Code review passes with no high-severity issues

## Key Files to Study First
- backend/app/main.py — existing API route patterns
- backend/app/api/auth.py — existing auth middleware (model API key auth similarly)
- backend/app/services/cached_rate_service.py — where live rate data lives
- backend/app/services/websocket_manager.py — existing WebSocket patterns
- backend/app/database/models.py — existing models
- backend/app/services/subscription_service.py — tier checking logic
- infrastructure/redis/redis.conf — Redis setup for rate limiting
