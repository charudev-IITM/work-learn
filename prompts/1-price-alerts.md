You are building a WhatsApp-based Price Alerts feature for SpotCompare — a real-time bullion dealer rate comparison SaaS. Backend is FastAPI with PostgreSQL and Redis. Frontend is React TypeScript. 99 percent mobile users. 16+ dealers, 50+ price scripts, rates update every second via WebSocket.

## Your Mission
Interview me to clarify requirements, then plan and build this feature end-to-end.

## Feature Vision
Users set price alerts on any watchlist script. Example: Alert me when KJ Bullion Gold 999 buy rate drops below 93500. When triggered, the alert is delivered via WhatsApp, not push notifications — WhatsApp is where our users live. Alerts should support:
- Threshold alerts (above/below a price)
- Spread alerts (difference between two dealers exceeds X)
- Staleness alerts (dealer has not updated in Y minutes)
- Cooldown periods (do not spam — once triggered, wait N minutes before re-triggering)
- Per-user alert limits based on subscription tier (Starter: 3, Pro: 15, Elite: unlimited)

WhatsApp delivery via a provider like Twilio WhatsApp API, MSG91 WhatsApp, or Interakt. We already use MSG91 for OTP — prefer MSG91 WhatsApp if available.

## Interview Me First
Before writing any code, interview me with targeted questions about:
- WhatsApp provider preference and budget constraints
- Alert evaluation architecture (where in the pipeline do we check alerts — in the rate broadcast loop or separate worker)
- UX for creating and managing alerts on mobile
- Tier limits and how they map to our existing subscription model
- Edge cases: what happens during market close, rate gaps, dealer downtime

## Process
1. Interview me with 3-5 questions per round until requirements are crystal clear
2. Use /feature-dev to explore the codebase and architect the solution
3. Plan with clear iterations:
   - Iteration 1: Backend alert model, CRUD API, alert evaluation engine
   - Iteration 2: WhatsApp integration and delivery pipeline
   - Iteration 3: Frontend alert creation UI (mobile-first)
   - Iteration 4: Tier-based limits and billing integration
4. Implement each iteration, using sub-agents for parallel work where possible
5. Use /code-review after each iteration to catch issues
6. Write tests: unit tests for alert evaluation logic, integration tests for WhatsApp delivery (mocked), and Playwright MCP end-to-end tests for the full flow (create alert, verify in UI, simulate rate trigger, verify delivery status)

## Completion Promise
The feature is DONE when:
- Users can create/edit/delete alerts from the watchlist UI on mobile
- Alert evaluation runs efficiently against live rate stream without adding latency
- WhatsApp messages are delivered within 5 seconds of trigger condition
- Cooldown and tier limits are enforced
- All tests pass (unit, integration, e2e with Playwright MCP)
- Code review passes with no high-severity issues

## Key Files to Study First
- backend/app/services/cached_rate_service.py — rate broadcasting pipeline (where alert evaluation hooks in)
- backend/app/services/differential_broadcast_manager.py — differential rate updates
- backend/app/services/msg91_service.py — existing MSG91 integration
- backend/app/services/subscription_service.py — tier/billing logic
- backend/app/database/models.py — existing DB models
- frontend/src/components/watchlist/WatchlistDisplay.tsx — where alert UI integrates
- frontend/src/contexts/WatchlistDataContext.tsx — real-time data flow
