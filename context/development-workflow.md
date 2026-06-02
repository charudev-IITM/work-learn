# Development Workflow

## Quick Start Commands

### Environment Setup
```bash
# Initial setup and requirement checks
./scripts/setup.sh

# Start all services in development mode
./scripts/start-dev.sh

# Stop all services
./scripts/stop-dev.sh
```

### Docker Commands
```bash
# Start all services (backend, frontend, postgres, redis)
docker-compose up -d

# Stop all services
docker-compose down

# View service logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Restart specific service
docker-compose restart backend
```

## Backend Development

### Environment Setup
```bash
cd backend
pip install -r requirements.txt
```

### Development Server
```bash
# Start backend development server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Test individual scrapers
python scripts/test-scrapers.py

# Run tests (when implemented)
python -m pytest
```

### Adding New Scrapers

1. **Determine Scraper Type**:
   - API-based: Extend `TabDelimitedAPIScraper` or `JSONAPIScraper`
   - WebSocket: Extend `BaseScraper` with WebSocket client
   - Custom: Extend `BaseScraper` directly

2. **Implement Scraper**:
   ```python
   # Example: scrapers/newdealer/newdealer_scraper.py
   from ..base.api_scraper import TabDelimitedAPIScraper
   from ..base.scraper import ScraperConfig, ScraperType
   
   class NewDealerScraper(TabDelimitedAPIScraper):
       def __init__(self):
           config = ScraperConfig(
               competitor_name="newdealer",
               base_url="https://api.newdealer.com",
               scraper_type=ScraperType.API
           )
           super().__init__(config)
       
       async def get_api_url(self) -> str:
           return f"{self.config.base_url}/rates?timestamp={int(time.time())}"
   ```

3. **Register Scraper**:
   - Add import to `scrapers/__init__.py`
   - Add to `SCRAPERS` dictionary
   - Add to `available_scrapers` list in `rates_service.py`

## Frontend Development

### Environment Setup
```bash
cd frontend
npm install
```

### Development Server
```bash
# Start frontend development server (Vite)
npm run dev

# Build for production
npm run build

# Run linting
npm run lint

# Run type checking
npm run typecheck
```

### Component Development

#### Creating New Components
1. **Components**: Create in `frontend/src/components/`
2. **Hooks**: Custom data hooks in `frontend/src/hooks/`
3. **Types**: TypeScript definitions in `frontend/src/types/`
4. **Styling**: Use Tailwind CSS classes and ShadCN UI components

#### Best Practices
- Always test in mobile viewports first (99% of users are mobile)
- Use existing design patterns from ShadCN UI
- Follow TypeScript strict mode requirements
- Implement proper error handling and loading states

## Database Changes

### Schema Updates
1. **Modify Schema**: Update `docker/init.sql`
2. **Update Models**: Modify SQLAlchemy models in `backend/app/database/models.py`
3. **Apply Changes**: `docker-compose down && docker-compose up -d postgres`

## Testing and Monitoring

### Service URLs
- **Frontend**: http://localhost:3000
- **Backend API Docs**: http://localhost:8000/docs
- **Redis Commander**: http://localhost:8081 (with `--profile debug`)
- **Database**: postgres:5432 (credentials in docker-compose.yml)

### Monitoring
```bash
# View all service logs
docker-compose logs -f

# Monitor specific service
docker-compose logs -f backend
docker-compose logs -f frontend

# Check service status
docker-compose ps

# View system resource usage
docker stats
```

## Debugging

### Backend Debugging
- Check scraper health: `GET /health`
- View scraper logs: `docker-compose logs -f backend`
- Monitor Redis: Connect to redis-cli or use Redis Commander
- Database queries: Connect to PostgreSQL with preferred client

### Frontend Debugging
- Browser DevTools Console for WebSocket messages
- React DevTools for component state
- Network tab for API calls
- Check localStorage for persistence issues

### Common Issues
1. **WebSocket connection failures**: Check backend is running and accessible
2. **Rate data not updating**: Verify scraper processes are healthy
3. **Persistence not working**: Check localStorage in browser DevTools
4. **Build failures**: Ensure all dependencies are installed

## Production Deployment

### Build Process
```bash
# Build frontend
cd frontend && npm run build

# Build backend Docker image
docker build -f docker/Dockerfile.backend -t comp-intel-backend .

# Build frontend Docker image  
docker build -f docker/Dockerfile.frontend -t comp-intel-frontend .
```

### Environment Variables
- Configure production environment variables
- Set up proper database connections
- Configure Redis for production use
- Set up SSL certificates for HTTPS

## Code Quality

### TypeScript
- Run `npm run typecheck` before commits
- Follow strict TypeScript configuration
- Use proper type definitions

### Linting
- Run `npm run lint` for frontend
- Follow ESLint configuration
- Use Prettier for code formatting

### Git Workflow
- Create feature branches for new work
- Write descriptive commit messages
- Test thoroughly before creating PRs
- Include the "Generated with Claude Code" footer when appropriate