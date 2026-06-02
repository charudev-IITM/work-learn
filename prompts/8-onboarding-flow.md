You are building an Onboarding Flow for SpotCompare — a real-time bullion dealer rate comparison SaaS. Backend is FastAPI with PostgreSQL and Redis. Frontend is React TypeScript. 99 percent mobile users. Users are Indian bullion traders and jewelers.

## Your Mission
Interview me to clarify requirements, then plan and build this feature end-to-end.

## Feature Vision
After a user signs up (via phone OTP), they currently land on an empty watchlist. This is a cold start problem — the user sees no value immediately and may churn before ever experiencing the product. We need a guided onboarding flow that activates them in under 60 seconds.

### Onboarding Steps (after signup completes)
1. Welcome Screen: Brief welcome with product value prop. "Compare live rates from 16+ dealers in one place." Animated gold/rate visualization. "Get Started" CTA.

2. Select Your Commodities: "What do you trade?" Multi-select chips: Gold, Silver, Copper, Platinum, Other. This helps us pre-populate relevant scripts. Most users will select Gold and Silver.

3. Select Your Region/Dealers: "Which dealers do you work with?" Show dealer cards with logos/names grouped by region if applicable. Pre-select popular dealers (KJ Bullion, CSV Bullion, RSBL). Let users select/deselect. Minimum 3 required.

4. Auto-Create First Watchlist: Based on commodity + dealer selections, auto-create a watchlist named "My Watchlist" with the most relevant scripts (e.g., Gold 999 Buy/Sell from each selected dealer). Show a preview of what the watchlist will look like with LIVE data already streaming.

5. Quick Feature Tour (optional, skippable): 3-4 quick tooltip overlays highlighting key features: swipe between watchlists, tap to expand script details, differences mode toggle, how to add more scripts. Use coach marks or spotlight overlays, not a separate tutorial page.

6. Set Your First Alert (optional, skippable): "Want to know when gold drops below a certain price?" Quick inline alert creation for their top script. Connects to the price alerts feature.

7. Done: Transition to the fully populated watchlist/dashboard. Celebration micro-animation. User sees immediate value — live rates updating in real-time.

### Design Principles
- Maximum 60 seconds from signup to seeing live rates
- Each step should be one screen, no scrolling needed
- Progress indicator (dots or bar) showing steps remaining
- "Skip" option on optional steps
- All selections persisted to backend immediately (not just localStorage)
- Beautiful, polished animations between steps (this is first impression)
- If user kills app mid-onboarding, resume where they left off
- Mobile-first, thumb-friendly large tap targets

### Backend Requirements
- Store onboarding state per user (which step they are on, their selections)
- Endpoint to get available dealers with their scripts, grouped logically
- Auto-watchlist creation endpoint that takes commodity + dealer selections and creates optimal watchlist
- Track onboarding completion rate for analytics (which step has highest drop-off)

## Interview Me First
Before writing any code, interview me about:
- Current post-signup flow: what happens today after OTP verification and name entry
- Which onboarding steps are must-have vs skippable
- Dealer data: do we have logos/display names for all 16 dealers, or just IDs
- Should onboarding be shown only once, or can users re-trigger it (e.g., "reset my setup")
- Analytics: do we have any analytics infrastructure, or is this the first instrumented flow
- The OnboardingForm.tsx component already exists — what does it do currently

## Process
1. Interview me with 3-5 questions per round until requirements are clear
2. Use /feature-dev to explore the codebase and architect the solution
3. Plan with clear iterations:
   - Iteration 1: Onboarding state model (backend), API for dealer/script catalog, step tracking
   - Iteration 2: Welcome screen and commodity selection UI
   - Iteration 3: Dealer selection and auto-watchlist creation
   - Iteration 4: Live preview of watchlist with streaming data
   - Iteration 5: Feature tour overlays and first alert creation
   - Iteration 6: Polish — animations, progress indicator, resume logic, analytics hooks
4. Implement each iteration, using sub-agents for parallel work
5. Use /code-review after each iteration
6. Write tests: unit tests for auto-watchlist creation logic, API tests for onboarding state management, Playwright MCP e2e tests (sign up as new user, go through each onboarding step, verify watchlist is created with correct scripts, verify live data is streaming, verify skip works, verify resume after app restart)

## Completion Promise
The feature is DONE when:
- New users see the onboarding flow immediately after signup
- Commodity and dealer selection works with pre-populated defaults
- Auto-created watchlist contains relevant scripts from selected dealers
- Live data is streaming on the preview/final watchlist
- Optional steps (tour, first alert) are skippable
- Onboarding state persists if user leaves mid-flow
- The flow completes in under 60 seconds for a typical user
- Returning users (onboarding complete) skip directly to dashboard
- All tests pass (unit, API, e2e with Playwright MCP)
- Code review passes with no high-severity issues

## Key Files to Study First
- frontend/src/components/auth/OnboardingForm.tsx — existing onboarding component (may need replacement or extension)
- frontend/src/components/auth/AuthPage.tsx — current post-signup flow
- frontend/src/contexts/AuthContext.tsx — auth state and user data
- frontend/src/App.tsx — routing (where to inject onboarding)
- backend/app/api/auth.py — signup/login endpoints
- backend/app/services/auth.py — user creation logic
- backend/app/database/models.py — user model (onboarding_complete field may exist)
- backend/scrapers/__init__.py — dealer/script registry for catalog
- frontend/src/services/watchlist.ts — watchlist creation API
- frontend/src/contexts/WatchlistContext.tsx — watchlist state
