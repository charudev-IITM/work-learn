# Bullion Competitive Intelligence Platform

A real-time competitive intelligence system for comparing rates across bullion dealers with configurable dashboards and live data updates.

## Features

- **Real-time Rate Monitoring**: Scrapes bullion rates every second from multiple dealers
- **Configurable Dashboard**: Grid-based leaderboard with competitor and script selection
- **Dual View Modes**: Absolute rates vs. difference comparison with pegged competitor
- **Live Updates**: WebSocket-powered real-time rate updates
- **CSV Export**: Export current view for further analysis
- **Web Scraping Engine**: Inheritance-based scraper architecture for easy site addition
- **Scalable Architecture**: Docker, Kubernetes, and Redis for high availability

## Technology Stack

- **Frontend**: React 18, TypeScript, ShadCN UI, Tailwind CSS
- **Backend**: Python, FastAPI, WebSockets
- **Database**: PostgreSQL (via Supabase)
- **Cache**: Redis
- **Deployment**: Docker, Kubernetes
- **Web Scraping**: aiohttp, BeautifulSoup, Selenium

## Supported Dealers

| Dealer | API Endpoint | Scripts Available |
|--------|-------------|-------------------|
| kjbullion.com | GET (tab-delimited) | Gold/Silver Chennai, Mumbai, Bangalore, Hyderabad, Coimbatore |
| arihantspot.in | GET (tab-delimited) | Gold 995/999 Indian/Imported, with/without GST |
| dpgold.com | GET (tab-delimited) | Gold by state (Karnataka, Tamil Nadu, Andhra, etc.) |
| slnbullion.com | GET (tab-delimited) | Gold Chennai/VJA/CBE Import 999, Silver Chennai |
| amsbullion.com | GET (tab-delimited) | Gold/Silver Import T+2 (All cities) |
| suswanibullion.com | GET (tab-delimited) | Gold 999 Import T+2, Silver Import T+2 |
| smsbullion.com | GET (tab-delimited) | Gold 999 Chennai/VJA/CBE, Import Gold/Silver |
| ashtasiddhi.co.in | GET (tab-delimited) | Gold 995/999 (4th AUG), with/without GST |
| rakshabullion.com | GET (tab-delimited) | Gold 995/999 (6th AUG), with/without GST |
| shivsahai.com | POST (JSON) | Gold/Silver by city (CHN, BLR, HYD, etc.) |
| csvbullion.com | WebSocket | All available scripts (your client site) |

## Quick Start

### Development with Docker Compose

1. **Clone and setup**:
   ```bash
   git clone <repository>
   cd comp-intel
   ```

2. **Start all services**:
   ```bash
   docker-compose up -d
   ```

3. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### Testing Scrapers

**Quick validation** (test all scrapers):
```bash
python3 scripts/test-scrapers.py
```

**Individual scraper testing**:
```bash
cd backend
python3 -c "
import asyncio
from scrapers import get_scraper

async def test():
    scraper = get_scraper('kjbullion')
    await scraper.start()
    rates = await scraper.scrape_rates()
    print(f'Scraped {len(rates)} rates')
    await scraper.stop()

asyncio.run(test())
"
```

### Manual Development Setup

#### Backend Setup
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

#### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
comp-intel/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI application
│   │   └── services/            # Core services
│   ├── scrapers/
│   │   ├── base/               # Base scraper classes
│   │   ├── kjbullion/          # KJ Bullion-style scrapers
│   │   └── csvbullion/         # WebSocket scrapers
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/         # React components
│   │   ├── hooks/             # Custom React hooks
│   │   └── lib/               # Utilities
│   └── package.json
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── nginx.conf
└── docker-compose.yml
```

## API Endpoints

- `GET /api/competitors` - List all competitors
- `GET /api/rates/current` - Get current rates for all competitors
- `GET /api/rates/current/{competitor}` - Get rates for specific competitor
- `GET /api/rates/historical` - Get historical rates with filtering
- `GET /api/rates/export` - Export current rates as CSV
- `WS /ws/rates` - WebSocket for real-time rate updates

## Dashboard Features

### Grid Layout
- **Rows**: Competitors
- **Columns**: Scripts (Gold 999, Silver 999, etc.)
- **Cells**: Buy/Sell rates with timestamps

### View Modes
1. **Absolute Rates**: Show actual buy/sell prices
2. **Difference Mode**: Show differences from pegged competitor

### Configuration
- Select competitors to display
- Choose specific scripts to track
- Toggle between buy/sell rates
- Set pegged competitor for difference calculations

## Adding New Scrapers

### For KJ Bullion-style sites:
```python
from scrapers.kjbullion.base_kjbullion import KJBullionBaseScraper

class NewSiteScraper(KJBullionBaseScraper):
    def __init__(self):
        config = ScraperConfig(
            competitor_name="newsite",
            base_url="https://newsite.com/",
            scraper_type=ScraperType.POLL
        )
        super().__init__(config)
```

### For WebSocket sites:
```python
from scrapers.base.scraper import BaseScraper, ScraperType

class WebSocketScraper(BaseScraper):
    async def scrape_rates(self):
        # Implement WebSocket connection logic
        pass
```

## Deployment

### Kubernetes Deployment
```bash
# Build and push images
docker build -f docker/Dockerfile.backend -t your-registry/bullion-backend .
docker build -f docker/Dockerfile.frontend -t your-registry/bullion-frontend .

# Deploy to Kubernetes
kubectl apply -f infrastructure/k8s/
```

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `SCRAPER_INTERVAL`: Rate scraping interval (default: 1 second)

## Monitoring

- **Health Checks**: `/health` endpoint for backend status
- **WebSocket Status**: Real-time connection indicator in UI
- **Rate Update Frequency**: Visual indicators for fresh data

## Future Enhancements

- **RBAC**: Role-based access control for different user types
- **Notifications**: WhatsApp/Slack alerts for rate changes
- **Advanced Analytics**: Historical charts and trend analysis
- **Mobile App**: React Native companion app
- **API Rate Limiting**: Protect against scraper overload

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your scraper or feature
4. Test thoroughly
5. Submit a pull request
