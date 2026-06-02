from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Any
import asyncio
import aiohttp
import logging
from enum import Enum

# Import request cache for optimization
try:
    import sys
    sys.path.append('/app')
    from app.services.request_cache import request_cache
except ImportError:
    request_cache = None

logger = logging.getLogger(__name__)

class ScraperType(Enum):
    WEBSOCKET = "websocket"
    API = "api"

@dataclass
class RateData:
    """Standardized rate data structure"""
    script_name: str
    symbol: str
    buy_rate: Optional[float] = None
    sell_rate: Optional[float] = None
    high_rate: Optional[float] = None
    low_rate: Optional[float] = None
    timestamp: datetime = None
    volume: Optional[int] = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()

    def to_dict(self) -> dict:
        """Serialize to a dict suitable for JSON transport."""
        return {
            "script_name": self.script_name,
            "symbol": self.symbol,
            "buy_rate": self.buy_rate,
            "sell_rate": self.sell_rate,
            "high_rate": self.high_rate,
            "low_rate": self.low_rate,
            "timestamp": self.timestamp.isoformat() if hasattr(self.timestamp, "isoformat") else str(self.timestamp),
            "volume": self.volume,
        }

@dataclass
class ScraperConfig:
    """Configuration for scrapers"""
    competitor_name: str
    base_url: str
    scraper_type: ScraperType
    poll_interval: int = 1  # seconds
    timeout: int = 30
    retries: int = 3
    headers: Dict[str, str] = None
    
    def __post_init__(self):
        if self.headers is None:
            self.headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }

class BaseScraper(ABC):
    """Base scraper class with common functionality"""
    
    def __init__(self, config: ScraperConfig):
        self.config = config
        self.session: Optional[aiohttp.ClientSession] = None
        self.is_running = False
        self._stop_event = asyncio.Event()
        
    async def __aenter__(self):
        await self.start()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.stop()
        
    async def start(self):
        """Initialize the scraper with optimized connection pooling"""
        if not self.session:
            # Create optimized connector for connection pooling
            connector = aiohttp.TCPConnector(
                limit=20,                    # Total connection pool size
                limit_per_host=5,           # Connections per host
                keepalive_timeout=300,      # Keep connections alive for 5 minutes  
                enable_cleanup_closed=True, # Clean up closed connections
                ttl_dns_cache=600,          # DNS cache TTL (10 minutes)
                use_dns_cache=True          # Enable DNS caching
            )
            
            timeout = aiohttp.ClientTimeout(total=self.config.timeout, connect=10)
            self.session = aiohttp.ClientSession(
                connector=connector,
                headers=self.config.headers,
                timeout=timeout,
                cookie_jar=aiohttp.CookieJar(unsafe=True)  # Allow cookies for session handling
            )
        self.is_running = True
        logger.info(f"Started scraper for {self.config.competitor_name}")
        
    async def stop(self):
        """Clean up resources"""
        self.is_running = False
        self._stop_event.set()
        if self.session:
            await self.session.close()
            self.session = None
        logger.info(f"Stopped scraper for {self.config.competitor_name}")
        
    @abstractmethod
    async def scrape_rates(self) -> List[RateData]:
        """Scrape rates from the source. Must be implemented by subclasses."""
        pass
        
    async def get_available_scripts(self) -> List[Dict[str, str]]:
        """Get list of available scripts/instruments"""
        try:
            rates = await self.scrape_rates()
            return [{'name': r.script_name, 'symbol': r.symbol} for r in rates]
        except Exception as e:
            logger.error(f"Error getting available scripts: {e}")
            return []
        
    async def run_continuous(self, callback=None):
        """Run continuous scraping"""
        logger.info(f"Starting continuous scraping for {self.config.competitor_name}")
        
        while self.is_running and not self._stop_event.is_set():
            try:
                rates = await self.scrape_rates()
                if rates and callback:
                    await callback(self.config.competitor_name, rates)
                    
                # Always respect poll_interval regardless of scraper type to avoid overwhelming APIs
                await asyncio.sleep(self.config.poll_interval)
                    
            except Exception as e:
                logger.error(f"Error in continuous scraping for {self.config.competitor_name}: {e}")
                await asyncio.sleep(5)  # Wait before retry
                
    async def _make_request(self, url: str, method: str = "GET", **kwargs) -> Optional[Any]:
        """Make HTTP request with caching, retry logic and exponential backoff"""
        
        # Use request cache if available
        if request_cache:
            return await request_cache.get_or_fetch(
                url=url,
                fetch_func=lambda: self._make_raw_request(url, method, **kwargs),
                method=method,
                ttl=15,  # 15 second cache for API responses
                **kwargs
            )
        else:
            return await self._make_raw_request(url, method, **kwargs)
    
    async def _make_raw_request(self, url: str, method: str = "GET", **kwargs) -> Optional[Any]:
        """Make raw HTTP request with enhanced retry logic and exponential backoff"""
        base_delay = 1  # Base delay in seconds
        max_delay = 30  # Maximum delay in seconds
        
        for attempt in range(self.config.retries):
            try:
                async with self.session.request(method, url, **kwargs) as response:
                    if response.status == 200:
                        return await response.text()
                    elif response.status in [429, 503, 504]:  # Rate limited or server errors
                        logger.warning(f"Rate limited/Server error {response.status} for {url}")
                        if attempt < self.config.retries - 1:
                            # Longer delay for rate limits
                            delay = min(max_delay, base_delay * (3 ** attempt))
                            logger.info(f"Waiting {delay}s before retry due to rate limit")
                            await asyncio.sleep(delay)
                        continue
                    else:
                        logger.warning(f"HTTP {response.status} for {url}")
                        
            except asyncio.TimeoutError:
                logger.warning(f"Timeout attempt {attempt + 1} for {url}")
                if attempt < self.config.retries - 1:
                    delay = min(max_delay, base_delay * (2 ** attempt))
                    await asyncio.sleep(delay)
            except aiohttp.ClientError as e:
                logger.error(f"Client error attempt {attempt + 1} for {url}: {e}")
                if attempt < self.config.retries - 1:
                    delay = min(max_delay, base_delay * (2 ** attempt))
                    await asyncio.sleep(delay)
            except Exception as e:
                logger.error(f"Request attempt {attempt + 1} failed for {url}: {e}")
                if attempt < self.config.retries - 1:
                    delay = min(max_delay, base_delay * (2 ** attempt))
                    await asyncio.sleep(delay)
                    
        logger.error(f"All {self.config.retries} attempts failed for {url}")
        return None
        
    def _parse_rate(self, value: Any) -> Optional[float]:
        """Safely parse rate value to float"""
        if value is None:
            return None
        try:
            # Remove common currency symbols and commas
            if isinstance(value, str):
                cleaned = value.replace(',', '').replace('₹', '').replace('$', '').strip()
                return float(cleaned) if cleaned else None
            return float(value)
        except (ValueError, TypeError):
            return None