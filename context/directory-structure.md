# Directory Structure

## Repository Overview
```
comp-intel/
├── backend/                    # Python FastAPI backend
│   ├── app/                   # Main FastAPI application
│   │   ├── main.py           # FastAPI app with lifespan management
│   │   ├── api/              # API routes for rate management
│   │   ├── database/         # Database models and connection
│   │   ├── services/         # Core services (cached rates, process management)
│   │   └── workers/          # Background workers
│   ├── scrapers/             # Web scraping modules
│   │   ├── __init__.py       # Scraper registry
│   │   ├── base/             # Base scraper classes
│   │   ├── kjbullion/        # KJ Bullion-style scrapers (tab-delimited API)
│   │   ├── csvbullion/       # CSVBullion WebSocket scraper
│   │   ├── rsbl/             # RSBL Firebase-based scraper
│   │   └── process_runner.py # Individual scraper process runner
│   ├── requirements.txt      # Python dependencies
│   └── scripts/              # Database initialization
├── frontend/                  # React TypeScript frontend
│   ├── src/                  
│   │   ├── components/       # React components (ShadCN UI)
│   │   │   ├── ui/           # Base UI components
│   │   │   └── watchlist/    # Watchlist-specific components
│   │   ├── contexts/         # React contexts (Watchlist, Theme, Data)
│   │   ├── hooks/            # Custom hooks (WebSocket, Rate data, Search)
│   │   └── types/            # TypeScript type definitions
│   ├── package.json          # Node.js dependencies
│   └── tailwind.config.js    # Tailwind CSS configuration
├── docker/                   # Docker configurations
│   ├── Dockerfile.backend    # Backend container
│   ├── Dockerfile.frontend   # Frontend container
│   └── init.sql             # Database schema
├── infrastructure/           # Deployment configurations
├── context/                  # Documentation context files
├── scripts/                  # Development scripts
│   ├── setup.sh             # Initial setup
│   ├── start-dev.sh         # Start development environment
│   └── stop-dev.sh          # Stop development environment
├── docker-compose.yml       # Multi-container development setup
└── CLAUDE.md                # Main documentation file
```

## Key Files & Directories

### Backend Core
- `backend/app/main.py` - FastAPI application entry point
- `backend/app/services/cached_rate_service.py` - Rate caching and WebSocket broadcasting
- `backend/app/services/rates_service.py` - Process management for scrapers
- `backend/scrapers/__init__.py` - Scraper registry and configuration

### Frontend Core  
- `frontend/src/App.tsx` - Main application component
- `frontend/src/contexts/WatchlistContext.tsx` - Watchlist state management
- `frontend/src/contexts/WatchlistDataContext.tsx` - WebSocket data provider
- `frontend/src/components/watchlist/WatchlistDisplay.tsx` - Main watchlist UI
- `frontend/src/components/watchlist/ScriptSearch.tsx` - Script search and add functionality

### Configuration
- `docker-compose.yml` - Development environment setup
- `frontend/package.json` - Frontend dependencies and scripts
- `backend/requirements.txt` - Python dependencies
- `scripts/start-dev.sh` - Development startup script