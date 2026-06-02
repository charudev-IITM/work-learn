You are building a Mobile Dashboard / Home Screen for SpotCompare — a real-time bullion dealer rate comparison SaaS. Backend is FastAPI with PostgreSQL and Redis. Frontend is React TypeScript. 99 percent mobile users. The app currently has watchlists, price alerts, a calculator, and a Reuters news feed.

## Your Mission
Interview me to clarify requirements, then plan and build this feature end-to-end.

## Feature Vision
Currently, users land directly on their watchlist. We want to build a Dashboard as the HOME screen — the first thing users see when they open the app. It aggregates key information from across the platform into a single glanceable view, then lets users navigate to deeper features via tabs or cards.

### Dashboard Sections (top to bottom on mobile)
1. Market Status Bar: Shows if MCX/COMEX are OPEN or CLOSED. Current gold/silver headline prices. INR/USD rate.
2. Quick Glance Cards: Best Gold 999 rate right now (dealer name + price). Best Silver 999 rate. Your most-watched scripts current rates (top 3 from default watchlist).
3. Alerts Summary: Active alerts count. Recently triggered alerts (last 3) with brief details. Quick link to manage alerts.
4. Rate Trends Mini-Chart: Tiny sparkline charts for Gold 999 and Silver 999 showing today intraday trend. Tappable to expand to full chart view.
5. News Headlines: Top 3 recent commodity news headlines from Reuters feed. Tappable to read full article. Link to full news feed.
6. Calculator Highlights: Top 2-3 computed values from calculator watchlist with live values. Quick link to calculator tab.
7. Navigation: Bottom tab bar with: Dashboard (home), Watchlists, News, Alerts, Calculator, Settings/Profile.

### Design Principles
- Mobile-first, single-column layout optimized for thumb scrolling
- Glanceable: user gets market context in 3 seconds without tapping anything
- Each section is a card that links to the deeper feature
- Pull-to-refresh to update everything
- Dark theme consistent with existing app
- Smooth animations for live price updates (reuse animated-price component)
- The dashboard should feel like a Bloomberg Terminal distilled for mobile

### Navigation Architecture Change
Currently the app likely has a simpler navigation structure. This feature requires rethinking the main navigation to support multiple top-level tabs: Dashboard, Watchlists, News, Alerts, Calculator, Profile. The dashboard becomes the default landing page.

## Interview Me First
Before writing any code, interview me about:
- Current navigation structure and routing — how the app is structured now and what needs to change
- Which dashboard sections are must-have for v1 vs nice-to-have for later
- Bottom tab bar design: how many tabs, icons, labels
- Should the dashboard be personalized (show user-specific data like their watchlist) or generic (same for everyone)
- Performance budget: how many real-time subscriptions can the dashboard maintain without lag
- Any existing dashboard or home component to build on or replace

## Process
1. Interview me with 3-5 questions per round until requirements are clear
2. Use /feature-dev to explore the codebase and architect the solution
3. Plan with clear iterations:
   - Iteration 1: Navigation architecture overhaul (bottom tab bar, routing for Dashboard/Watchlists/News/Alerts/Calculator/Profile)
   - Iteration 2: Dashboard layout and skeleton (mobile-first card-based layout with sections)
   - Iteration 3: Wire dashboard sections to live data (market status, best rates, alerts summary)
   - Iteration 4: Sparkline charts and news integration
   - Iteration 5: Polish, animations, pull-to-refresh, transitions between tabs
4. Implement each iteration, using sub-agents for parallel work (e.g., navigation overhaul + dashboard layout in parallel)
5. Use /code-review after each iteration
6. Write tests: unit tests for data aggregation logic, Playwright MCP e2e tests (open app, verify dashboard loads as home, verify each section shows data, tap through to watchlist/news/alerts, verify bottom tab navigation)

## Completion Promise
The feature is DONE when:
- Dashboard is the default landing page when users open the app
- All must-have sections render with live data
- Bottom tab navigation works smoothly between Dashboard/Watchlists/News/Alerts/Calculator
- Each dashboard card links to the correct deeper view
- Pull-to-refresh works
- Performance is acceptable on mobile (no jank from multiple real-time subscriptions)
- Dark theme is consistent with existing app
- All tests pass (unit, e2e with Playwright MCP)
- Code review passes with no high-severity issues

## Key Files to Study First
- frontend/src/App.tsx — current routing and app structure
- frontend/src/views/ — existing view components (WatchlistView, AdminView, DashboardView)
- frontend/src/components/watchlist/WatchlistDisplay.tsx — existing main UI patterns
- frontend/src/components/watchlist/WatchlistTabs.tsx — existing tab navigation
- frontend/src/contexts/WatchlistDataContext.tsx — real-time data provider
- frontend/src/stores/rateStore.ts — rate data access
- frontend/src/components/ui/animated-price.tsx — price animation component to reuse
- frontend/src/contexts/AuthContext.tsx — auth state for personalization
