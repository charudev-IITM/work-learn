# Architecture Overview

## Technology Stack
- **Backend**: Python 3.11+, FastAPI, asyncio, aiohttp
- **Frontend**: React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS
- **Database**: PostgreSQL 15 with asyncpg driver
- **Cache & Messaging**: Redis 7 with async support
- **Process Management**: subprocess, psutil for health monitoring
- **Deployment**: Docker, multi-stage builds

## Backend Services Architecture

### 1. Main FastAPI App (`app/main.py`)
- Application lifespan management
- CORS configuration for frontend
- WebSocket endpoint for real-time updates
- Health checks and monitoring

### 2. Cached Rate Service (`app/services/cached_rate_service.py`)
- In-memory rate caching with Redis persistence
- WebSocket broadcasting to connected clients
- Historical data management
- CSV export functionality

### 3. Process Management Service (`app/services/rates_service.py`)
- Individual scraper process isolation
- Health monitoring and auto-restart
- Redis-based inter-process communication
- Fault tolerance and recovery

### 4. Database Layer
- SQLAlchemy models for rate records, competitors, scripts
- Async database operations
- Optimized indexes for time-series queries

## Scraper Architecture

### Base Classes
- `BaseScraper` (`scrapers/base/scraper.py`): Abstract base with common functionality
- `APIBaseScraper` (`scrapers/base/api_scraper.py`): For REST API-based scrapers
- `TabDelimitedAPIScraper`: For tab-delimited response parsing
- `JSONAPIScraper`: For JSON response parsing

### Scraper Types
- **KJ Bullion Style** (`scrapers/kjbullion/`): Tab-delimited API scrapers (most dealers)
  - arihantspot, dpgold, slnbullion, amsbullion, suswanibullion, etc.
- **WebSocket** (`scrapers/csvbullion/`): Real-time WebSocket data
- **Firebase** (`scrapers/rsbl/`): Firebase Realtime Database integration

### Process Isolation
- Each scraper runs in its own subprocess via `process_runner.py`
- Health monitoring with heartbeat mechanism
- Automatic restart on failure with exponential backoff
- Redis pub/sub for rate data communication

## Frontend Architecture

### State Management
- `WatchlistContext`: Watchlist CRUD operations and persistence
- `WatchlistDataContext`: WebSocket data management and rate updates
- `ThemeContext`: Dark/light theme support
- Custom hooks for data fetching and WebSocket communication

### Component Structure
- `WatchlistApp`: Main watchlist application container
- `WatchlistDisplay`: Primary watchlist view with real-time rates
- `ScriptSearch`: Search and add scripts functionality
- `WatchlistAppWrapper`: Wrapper for context providers

### Data Flow
1. **WebSocket Connection**: Centralized in `WatchlistDataContext`
2. **Rate Updates**: Flow through `useWatchlistData` hook
3. **UI Updates**: Components subscribe to context changes
4. **Persistence**: localStorage integration in `WatchlistContext`

## API Endpoints

### Core APIs
- `GET /` - API information and version
- `GET /health` - Health check with scraper status
- `GET /api/competitors` - List all competitors with metadata
- `GET /api/competitors/{name}/scripts` - Available scripts per competitor
- `GET /api/rates/current` - Current rates for all competitors
- `GET /api/rates/current/{competitor}` - Current rates for specific competitor
- `GET /api/rates/historical` - Historical rate data with filters
- `GET /api/rates/export` - CSV export of current rates
- `WS /ws/rates` - WebSocket for real-time rate updates

### Management APIs
- `POST /api/management/scrapers/{name}/start` - Start specific scraper
- `POST /api/management/scrapers/{name}/stop` - Stop specific scraper
- `POST /api/management/scrapers/{name}/restart` - Restart specific scraper
- `GET /api/management/scrapers/status` - Get all scrapers status

## WebSocket Data Flow

### Connection Management
- Single centralized WebSocket connection in `WatchlistDataProvider`
- Automatic reconnection with exponential backoff
- Connection state monitoring and error handling

### Message Format
```typescript
{
  type: "rate_update",
  competitor: "kjbullion",
  rates: [
    {
      symbol: "GOLD_CURRENT",
      script_name: "Gold Current",
      buy_rate: 101055.0,
      sell_rate: 101067.0,
      timestamp: "2025-08-27T10:22:45.123Z"
    }
  ]
}
```

### Data Processing
1. WebSocket messages received in `WatchlistDataContext`
2. Data processed through `useWatchlistData` hook
3. Rate matching against watchlist scripts by symbol
4. UI updates triggered through React context changes