You are building a Commodity News Aggregation feature for SpotCompare — a real-time bullion dealer rate comparison SaaS. Backend is FastAPI with PostgreSQL and Redis. Frontend is React TypeScript. Users are Indian bullion traders and jewelers.

## Your Mission
Interview me to clarify requirements, then plan and build this feature end-to-end.

## Feature Vision
A dedicated News section that aggregates commodity-related news from Reuters and other sources, making it searchable, filterable, and relevant to bullion traders. Think of it as a Bloomberg Terminal-lite news feed for the Indian bullion market.

### Core Requirements
- Scraping/Ingestion: Pull commodity news from Reuters, potentially other sources (Moneycontrol, Economic Times Commodities, Kitco, Bullion Desk)
- Storage: Each article stored with: title, body/summary, source, published_at, scraped_at, URL, author
- Tagging/Classification: Auto-tag articles with:
  - Commodity tags: Gold, Silver, Platinum, Palladium, Copper, Crude Oil
  - Topic tags: Price Movement, Central Bank, Import/Export, Duty/Tax, MCX, COMEX, Demand/Supply, Jewelry Industry, Mining
  - Geography tags: India, US, China, Middle East, Global
  - Sentiment: Bullish, Bearish, Neutral (if feasible)
- Search: Full-text search across title and body
- Filtering: By commodity, topic, geography, source, date range
- Sorting: By recency, relevance (to search query)
- Frontend: Mobile-first news feed with infinite scroll, tag chips for filtering, search bar, article detail view

### Architecture Considerations
- Scraping approach: RSS feeds, direct HTML scraping, or Reuters API. Consider legal/TOS implications — interview me about this
- Scraping frequency: every 5-15 minutes for near-real-time news
- Tagging: keyword-based rules vs LLM-based classification (cost vs accuracy tradeoff)
- Storage: PostgreSQL with full-text search (tsvector) vs adding Elasticsearch/Meilisearch
- Background worker for scraping (separate from rate scrapers)
- Caching layer for popular queries

## Interview Me First
Before writing any code, interview me about:
- Legal approach to scraping (RSS is generally safe, direct scraping may violate TOS — what is my risk appetite)
- Source priority: Reuters only, or multiple sources from the start
- Tagging approach: rule-based keyword matching (cheap, fast, good-enough) vs LLM classification (expensive, better)
- Search infrastructure: PostgreSQL full-text search (simpler) vs dedicated search engine (better but more infra)
- Monetization: is news free for all tiers, or is it a premium feature
- Do we need article summaries (LLM-generated 2-line summaries for quick scanning)

## Process
1. Interview me with 3-5 questions per round until requirements are crystal clear
2. Use /feature-dev to explore the codebase and architect the solution
3. Plan with clear iterations:
   - Iteration 1: News scraper framework (source adapters, scheduling, dedup)
   - Iteration 2: DB schema, ingestion pipeline, auto-tagging engine
   - Iteration 3: Search/filter API endpoints with full-text search
   - Iteration 4: Frontend news feed UI (mobile-first, infinite scroll, filters)
   - Iteration 5: Additional sources, refinement, tier gating
4. Implement each iteration, using sub-agents for parallel work (e.g., scraper + DB schema in parallel, API + frontend in parallel)
5. Use /code-review after each iteration
6. Write tests: unit tests for scraper parsing and tagging logic, API tests for search/filter accuracy, Playwright MCP e2e tests (open news feed, search for gold, verify results, filter by tag, verify filtering, open article detail)

## Completion Promise
The feature is DONE when:
- News scraper runs on schedule, pulling articles from at least one source
- Articles are stored with proper tagging (commodity, topic, geography)
- Full-text search works with relevance ranking
- Filter by any tag combination works correctly
- Mobile-first news feed UI with infinite scroll is smooth
- Article detail view renders cleanly on mobile
- Deduplication prevents same article from appearing twice
- All tests pass (unit, API, e2e with Playwright MCP)
- Code review passes with no high-severity issues

## Key Files to Study First
- backend/scrapers/base/scraper.py — existing scraper patterns to follow
- backend/scrapers/__init__.py — scraper registry pattern
- backend/scraper_worker.py — separate worker process pattern
- backend/app/database/models.py — existing DB model patterns
- backend/app/database/connection.py — DB connection patterns
- backend/app/main.py — API route registration
- frontend/src/App.tsx — routing and page structure
- frontend/src/views/ — existing view patterns
