You are building a Gold Agent — an AI-powered chat assistant for SpotCompare, a real-time bullion dealer rate comparison SaaS. Backend is FastAPI with PostgreSQL and Redis. Frontend is React TypeScript. 99 percent mobile users. Users are Indian bullion traders and jewelers.

## Your Mission
Interview me to clarify requirements, then plan and build this feature end-to-end.

## Feature Vision
A lightweight AI chat assistant that answers questions using live platform data. Think of it as a conversational interface to SpotCompare data — the user asks a question in natural language and gets an instant, data-driven answer. This is NOT a general-purpose chatbot — it is laser-focused on bullion market queries using OUR data.

### Example Queries It Should Handle
- "What is the best gold 999 rate right now?" — queries live rates, returns dealer with best price
- "Which dealer has been cheapest for gold this week?" — queries rate history, computes averages
- "What is the MCX-spot spread for KJ Bullion?" — computes spread from live data
- "Show me gold price trend today" — returns a mini chart or summary of intraday movement
- "Any news about gold import duty?" — searches Reuters news feed with tag filtering
- "Compare KJ Bullion vs CSV Bullion for gold 999" — side-by-side rate comparison
- "What is my portfolio worth right now?" — if trade journal exists, compute current value
- "Set an alert for gold below 93000" — create an alert via conversation (action, not just info)
- "Convert 100 grams gold to troy ounces" — simple unit conversion
- "What was gold rate at 3pm yesterday?" — historical lookup

### Architecture: Keep Costs Minimal
This is the critical constraint. We need sub-rupee-per-query costs. Strategy:

1. Tool-based architecture (not raw context stuffing):
   - Define 8-10 specific tools the LLM can call: get_live_rates, get_best_rate, get_rate_history, search_news, get_exchange_rates, create_alert, get_portfolio, calculate_spread
   - The LLM reasons about WHICH tool to call, NOT about raw data
   - Tools query our own backend APIs — the LLM never sees full rate tables
   - This keeps token usage minimal (small system prompt + tool definitions + user query + tool result + response)

2. Use the cheapest capable model:
   - Claude Haiku or GPT-4o-mini for query understanding and tool selection
   - These cost roughly 0.25-1 USD per million input tokens
   - Average query: ~500 input tokens + ~200 output tokens = ~0.0002 USD per query
   - At 100 queries/user/month, thats about 0.02 USD per user per month — negligible vs Rs 999 subscription

3. Caching layer:
   - Cache common queries like "best gold rate right now" for 5-10 seconds
   - Cache news search results for 5 minutes
   - Semantic similarity matching: if two users ask similar questions within seconds, serve cached response

4. Rate limiting per tier:
   - Starter: 20 queries/day
   - Pro: 100 queries/day
   - Elite: unlimited
   - Show remaining query count in the chat UI

5. Pre-computed answers for top queries:
   - "Best rate" queries can be pre-computed every few seconds
   - "Market summary" can be a cached response refreshed every minute
   - Only complex/custom queries actually hit the LLM

### Frontend Design
- Floating action button (FAB) in bottom-right corner of the app
- Opens a chat sheet (bottom sheet on mobile, sliding up from bottom)
- Clean chat bubbles: user messages on right, agent responses on left
- Agent responses can include: text, mini rate tables, mini charts, action buttons (confirm alert creation)
- Quick suggestion chips at the bottom: "Best gold rate", "Market summary", "MCX spread"
- Typing indicator while LLM is processing
- Chat history persisted per session (not across sessions to keep costs down)

### Backend Design
- New endpoint: POST /api/agent/chat with message body and session context
- Backend handles: tool definitions, LLM API call, tool execution, response formatting
- Tools call internal services (cached_rate_service, news search, alert CRUD) — no external API calls
- Session state: keep last 5 messages as context (sliding window to control token costs)
- Streaming response via SSE for perceived speed

## Interview Me First
Before writing any code, interview me about:
- LLM provider preference: Anthropic Claude API (we are building on Claude after all) vs OpenAI vs open-source (Llama via Groq for speed)
- Which tools are must-have for v1 vs later (rate lookup, news search, alert creation, history lookup, calculations)
- Should the agent be able to take ACTIONS (create alerts, add scripts to watchlist) or only answer questions in v1
- Cost budget: what is the acceptable cost per user per month for this feature
- Privacy: should user queries be logged for improving the agent, or is privacy paramount
- Fallback: what happens when the LLM is down or rate limited — show error, or degrade to keyword-based search

## Process
1. Interview me with 3-5 questions per round until requirements are clear
2. Use /feature-dev to explore the codebase and architect the solution
3. Plan with clear iterations:
   - Iteration 1: Tool definitions and backend tool executor (get_live_rates, get_best_rate, search_news)
   - Iteration 2: LLM integration with tool-calling (system prompt, model selection, API call)
   - Iteration 3: Chat API endpoint with session management and streaming (SSE)
   - Iteration 4: Frontend chat UI (FAB, bottom sheet, chat bubbles, suggestion chips)
   - Iteration 5: Caching layer, rate limiting, cost tracking per user
   - Iteration 6: Action tools (create_alert, add_to_watchlist) with confirmation UX
4. Implement each iteration, using sub-agents for parallel work (e.g., backend tools + frontend chat UI in parallel)
5. Use /code-review after each iteration
6. Write tests: unit tests for each tool function, unit tests for token cost estimation, API tests for chat endpoint (mock LLM responses), rate limit enforcement tests, Playwright MCP e2e tests (open chat, send query, verify response contains rate data, test suggestion chips, test action confirmation flow)

## Completion Promise
The feature is DONE when:
- Chat UI opens from FAB on any screen in the app
- At least 5 core tools work: get_best_rate, get_live_rates, search_news, get_exchange_rates, calculate_spread
- LLM correctly routes queries to the right tool
- Responses include formatted rate data (not just raw text)
- Caching prevents redundant LLM calls for common queries
- Rate limiting enforces per-tier query limits
- Cost per query is under 0.001 USD (verified by token tracking)
- Streaming responses provide fast perceived performance
- Mobile chat UI is smooth and fits the existing app design
- All tests pass (unit, API, e2e with Playwright MCP)
- Code review passes with no high-severity issues

## Key Files to Study First
- backend/app/services/cached_rate_service.py — live rate data access (tool: get_live_rates)
- backend/app/services/watchlist_service.py — watchlist operations (tool: add_to_watchlist)
- backend/app/database/models.py — existing models (for news search, alert creation tools)
- backend/app/api/watchlist.py — existing API patterns to follow
- backend/app/main.py — route registration
- frontend/src/stores/rateStore.ts — client-side rate access
- frontend/src/App.tsx — where to mount FAB globally
- frontend/src/components/ui/ — existing UI components and design patterns
- backend/requirements.txt — check existing LLM/AI dependencies
