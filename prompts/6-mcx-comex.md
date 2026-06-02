You are building MCX/COMEX Live Rates and Spot-Futures Spread feature for SpotCompare — a real-time bullion dealer rate comparison SaaS. Backend is FastAPI with PostgreSQL and Redis. Frontend is React TypeScript. 16+ Indian bullion dealers, 50+ scripts, rates update every second via WebSocket. 99 percent mobile users.

## Your Mission
Interview me to clarify requirements, then plan and build this feature end-to-end.

## Feature Vision
Indian bullion traders constantly compare dealer spot rates against MCX futures and international benchmarks (COMEX, LBMA) to judge if a dealer rate is fair. Currently they use a separate app for this. We want to bring exchange rates INTO SpotCompare so it becomes the only app they need.

### What to Show
- MCX Gold (various contracts: near month, far month), MCX Silver, MCX Gold Mini, MCX Gold Petal
- COMEX Gold (GC), COMEX Silver (SI)
- LBMA AM/PM Fix (daily reference prices)
- INR/USD exchange rate (needed to convert COMEX USD prices to INR for comparison)
- Spot-Futures Spread: the difference between a dealers spot rate and the nearest MCX futures contract. This tells traders whether the spot market is at a premium or discount to futures.
- Basis calculation: Dealer Spot Rate minus MCX Near Month. Positive = spot premium, negative = spot discount. Show this per dealer.

### Data Sources (need to explore)
- MCX: Official MCX website has delayed data. Real-time needs MCX data vendor or scraping mcxindia.com. Some free APIs may exist.
- COMEX: CME Group has delayed data. Yahoo Finance, Investing.com, TradingView have near-real-time. Google Finance API.
- LBMA: Published daily, can be scraped from lbma.org.uk
- INR/USD: RBI reference rate (daily) or live forex from a free API like exchangerate-api or currencyapi.

### Architecture Considerations
- Exchange rates update less frequently than dealer rates (MCX every few seconds during market hours, COMEX delayed, LBMA once/twice daily)
- Need market hours awareness: MCX trades 9 AM - 11:30 PM IST (Mon-Fri), COMEX nearly 24 hours
- Show market status: OPEN/CLOSED badge with next open time
- Spot-futures spread should update in real-time as either the dealer rate OR the MCX rate changes
- Store exchange rates in the same rate pipeline or a separate one

## Interview Me First
Before writing any code, interview me about:
- Data source preferences and budget (free scraped data vs paid API subscription)
- Which exchange contracts matter most (MCX Gold vs Gold Mini vs Gold Petal)
- Where to show exchange rates in the UI (separate tab, integrated into watchlist, or a market overview panel)
- Spot-futures spread: show per-dealer in the watchlist, or as a separate comparison view
- Historical exchange rate data: store for charts, or live-only for now
- Legal considerations for scraping exchange data

## Process
1. Interview me with 3-5 questions per round until requirements are clear
2. Use /feature-dev to explore the codebase and architect the solution
3. Plan with clear iterations:
   - Iteration 1: Exchange rate scrapers (MCX, COMEX, LBMA, INR/USD) with market hours awareness
   - Iteration 2: Exchange rate storage and real-time broadcasting via existing WebSocket pipeline
   - Iteration 3: Spot-futures spread calculation engine (dealer rate minus MCX rate, per dealer)
   - Iteration 4: Frontend UI for exchange rates and spread display (mobile-first)
   - Iteration 5: Market status indicators and historical tracking
4. Implement each iteration, using sub-agents for parallel work
5. Use /code-review after each iteration
6. Write tests: unit tests for spread calculation and market hours logic, API tests for exchange rate endpoints, Playwright MCP e2e tests (view exchange rates, verify market status badge, check spread updates when rates change)

## Completion Promise
The feature is DONE when:
- At least MCX Gold and COMEX Gold rates are displayed in real-time (during market hours)
- Spot-futures spread is calculated per dealer and updates live
- Market status (OPEN/CLOSED) is shown with correct market hours
- INR/USD conversion allows COMEX rates to be shown in INR
- Exchange rates integrate into the existing WebSocket pipeline without breaking dealer rates
- Mobile UI is clean and informative
- All tests pass (unit, API, e2e with Playwright MCP)
- Code review passes with no high-severity issues

## Key Files to Study First
- backend/scrapers/base/scraper.py — existing scraper patterns
- backend/scrapers/__init__.py — scraper registry
- backend/app/services/cached_rate_service.py — rate broadcasting pipeline
- backend/app/services/differential_broadcast_manager.py — differential updates
- frontend/src/stores/rateStore.ts — client-side rate data
- frontend/src/components/watchlist/WatchlistDisplay.tsx — existing rate display
- frontend/src/contexts/WatchlistDataContext.tsx — WebSocket data flow
