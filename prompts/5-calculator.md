You are building a Calculator / Computed Values feature for SpotCompare — a real-time bullion dealer rate comparison SaaS. Backend is FastAPI with PostgreSQL and Redis. Frontend is React TypeScript. 16+ dealers, 50+ scripts, rates update every second via WebSocket.

## Your Mission
Interview me to clarify requirements, then plan and build this feature end-to-end.

## Feature Vision
A dedicated Calculator watchlist where users define custom formulas using live rates from any dealer/script, constants, and math operations. Results update in real-time as underlying rates change. Think of it as a live spreadsheet cell powered by real-time bullion data.

### Example Use Cases
- Ratio tracking: KJBullion.Gold999.Buy / CSVBullion.Gold999.Buy — tracks premium/discount between dealers in real-time
- Margin calculation: KJBullion.Gold999.Sell - KJBullion.Gold999.Buy — live spread monitoring
- Custom unit conversion: DPGold.Gold999.Buy * 0.032151 — troy ounce to gram conversion
- Arbitrage profit: (DealerA.Gold999.Sell - DealerB.Gold999.Buy) * 100 — profit on 100g arbitrage
- Multi-step formulas: (KJBullion.Gold999.Buy + CSVBullion.Gold999.Buy) / 2 — average buy rate across dealers
- Percentage difference: ((DealerA.Gold999.Buy - DealerB.Gold999.Buy) / DealerB.Gold999.Buy) * 100 — percent premium
- With constants: KJBullion.Gold999.Buy * 1.03 — rate with 3 percent GST included

### Core Requirements
- Formula Builder UI: Mobile-friendly formula creation — user picks operands from a list of available dealer/script/rate-type combinations, adds operators (plus, minus, multiply, divide), constants, and parentheses
- Dedicated Watchlist: A special Calculator tab in the watchlist area that only shows computed values
- Real-time Updates: As underlying rates change (every second), computed values recalculate and animate (using existing animated-price component)
- Naming: User gives each computed value a custom name (e.g., KJ vs CSV Premium, Gold Spread)
- Persistence: Formulas stored server-side per user
- Error Handling: Graceful handling when a referenced dealer/script is stale or unavailable (show N/A or last known value with stale indicator)
- Math Precision: Proper decimal handling (no floating point display artifacts)

### Architecture Considerations
- Formula parsing: where does evaluation happen? Frontend (in rateStore subscriber) vs Backend (computed in broadcast pipeline)
- Formula syntax: structured AST (tree of operand/operator nodes) vs string expression parsing
- How to efficiently subscribe to only the rates a formula references (avoid recomputing on every rate update)
- Formula validation at creation time (ensure referenced dealers/scripts exist)

## Interview Me First
Before writing any code, interview me about:
- Formula complexity ceiling: simple binary operations only, or full expression trees with parentheses and multiple operators
- Evaluation location: client-side (simpler, no backend changes, but formula logic duplicated) vs server-side (centralized, works for API/alerts, but adds broadcast complexity)
- UI approach for formula builder: visual block builder (drag dealer+script blocks, drop operators) vs text input with autocomplete vs step-by-step wizard
- Should computed values be usable in alerts (alert me when KJ/CSV ratio exceeds 1.005)
- Maximum formulas per user and tier-gating
- Should users be able to share formulas with others

## Process
1. Interview me with 3-5 questions per round until requirements are clear
2. Use /feature-dev to explore the codebase and architect the solution
3. Plan with clear iterations:
   - Iteration 1: Formula data model (AST schema), CRUD API, formula validation
   - Iteration 2: Real-time evaluation engine (subscribe to referenced rates, recompute on change)
   - Iteration 3: Formula builder UI (mobile-first, step-by-step creation)
   - Iteration 4: Calculator watchlist tab (display computed values, real-time animation)
   - Iteration 5: Polish — error states, stale handling, decimal precision, naming
4. Implement each iteration, using sub-agents for parallel work (e.g., backend formula engine + frontend builder UI in parallel)
5. Use /code-review after each iteration
6. Write tests: unit tests for formula parsing and evaluation (edge cases: division by zero, missing rates, nested parentheses), API tests for formula CRUD and validation, Playwright MCP e2e tests (create formula via builder, verify it appears in calculator tab, simulate rate change, verify computed value updates, edit formula, verify recalculation)

## Completion Promise
The feature is DONE when:
- Users can create formulas referencing any dealer/script/rate-type plus constants
- Formulas support add, subtract, multiply, divide and parentheses for grouping
- Computed values update in real-time as underlying rates change
- Calculator watchlist tab displays all user computed values
- Stale/unavailable rates are handled gracefully (no crashes, clear indicators)
- Decimal precision is correct (no floating point artifacts like 93450.00000001)
- Formulas persist server-side and sync across sessions
- Mobile-first formula builder is usable on small screens
- All tests pass (unit, API, e2e with Playwright MCP)
- Code review passes with no high-severity issues

## Key Files to Study First
- frontend/src/stores/rateStore.ts — rate data structure and subscription model (formula evaluation hooks here)
- frontend/src/components/watchlist/WatchlistDisplay.tsx — existing watchlist rendering (calculator tab follows same patterns)
- frontend/src/components/ui/animated-price.tsx — animated price display (reuse for computed values)
- frontend/src/contexts/WatchlistContext.tsx — watchlist state management
- frontend/src/contexts/WatchlistDataContext.tsx — real-time data flow
- backend/app/database/models.py — existing models (formula model goes here)
- backend/app/services/watchlist_service.py — existing watchlist CRUD patterns
- backend/app/api/watchlist.py — existing watchlist API patterns
