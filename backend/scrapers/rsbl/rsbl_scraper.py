import asyncio
import aiohttp
import json
import logging
from typing import List, Dict, Optional
from ..base.scraper import BaseScraper, RateData, ScraperConfig, ScraperType

logger = logging.getLogger(__name__)

# Ultra-fast JSON parser
try:
    import ujson
    HAS_UJSON = True
except ImportError:
    ujson = None
    HAS_UJSON = False

class RSBLScraper(BaseScraper):
    """Optimized Firebase scraper for RSBL live rates"""
    
    def __init__(self):
        config = ScraperConfig(
            competitor_name="rsbl",
            base_url="https://rsbl.in/live-rates/",
            scraper_type=ScraperType.API,
            poll_interval=2,
            headers={
                'Origin': 'https://rsbl.in',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
            }
        )
        super().__init__(config)
        self.firebase_url = "https://rsbl-spot-gold-silver-prices.firebaseio.com/liverates.json"
        self.states_url = "https://rsbl-spot-gold-silver-prices.firebaseio.com/websitesettings/statesymbolmap.json"
        
        # Symbol mappings cache
        self.symbol_display_names = {}
        self.symbol_state_mapping = {}
        
    async def start(self):
        """Initialize optimized connection pool for Firebase"""
        if not self.session:
            connector = aiohttp.TCPConnector(
                limit=10,
                limit_per_host=5,
                ttl_dns_cache=300,
                use_dns_cache=True,
                keepalive_timeout=30,
                enable_cleanup_closed=True,
                force_close=False
            )
            
            timeout = aiohttp.ClientTimeout(total=10, connect=3, sock_read=5)
            self.session = aiohttp.ClientSession(
                connector=connector,
                timeout=timeout,
                headers=self.config.headers
            )
        
        self.is_running = True
        
    async def stop(self):
        """Clean up connection pool"""
        self.is_running = False
        self._stop_event.set()
        if self.session:
            await self.session.close()
            self.session = None
        
    async def scrape_rates(self) -> List[RateData]:
        """Scrape rates from Firebase with optimized processing"""
        try:
            # Load state mappings once at startup
            if not self.symbol_display_names:
                await self._load_state_mappings()
            
            # Fetch Firebase data
            response_text = await self._fetch_firebase_data()
            if not response_text:
                return []
            
            # Parse JSON with ujson if available
            try:
                data = ujson.loads(response_text) if HAS_UJSON else json.loads(response_text)
            except (ValueError, json.JSONDecodeError):
                return []
            
            if not isinstance(data, dict):
                return []
            
            # Process rates
            return self._process_firebase_rates(data)
            
        except Exception as e:
            logger.error(f"Firebase scraping error: {e}")
            return []
    
    async def _fetch_firebase_data(self) -> Optional[str]:
        """Fetch data from Firebase with error handling"""
        try:
            async with self.session.get(self.firebase_url) as response:
                if response.status == 200:
                    return await response.text()
                else:
                    logger.warning(f"Firebase HTTP {response.status}")
                    return None
        except Exception as e:
            logger.error(f"Firebase request error: {e}")
            return None

    def _process_firebase_rates(self, data: Dict) -> List[RateData]:
        """Process Firebase data into RateData objects"""
        rates = []
        
        for symbol, rate_info in data.items():
            if not isinstance(rate_info, dict):
                continue
                
            # Get buy/sell rates
            buy_value = rate_info.get('Buy') or rate_info.get('Bid')
            sell_value = rate_info.get('Sell') or rate_info.get('Ask')
            
            if not (buy_value or sell_value):
                continue
            
            try:
                buy_rate = float(buy_value) if buy_value else None
                sell_rate = float(sell_value) if sell_value else None
                
                if not (buy_rate or sell_rate):
                    continue
                    
                # Build script name
                base_name = (self.symbol_display_names.get(symbol) or 
                            rate_info.get('webDisplayName') or 
                            rate_info.get('Name', symbol))
                
                state_name = self.symbol_state_mapping.get(symbol)
                script_name = f"{base_name} ({state_name})" if state_name else base_name
                
                # Get high/low rates
                high_rate = self._parse_rate(rate_info.get('High'))
                low_rate = self._parse_rate(rate_info.get('Low'))
                
                rates.append(RateData(
                    script_name=script_name,
                    symbol=symbol.upper(),
                    buy_rate=buy_rate,
                    sell_rate=sell_rate,
                    high_rate=high_rate,
                    low_rate=low_rate
                ))
                
            except Exception:
                continue
        
        return rates
    
    async def _load_state_mappings(self):
        """Load symbol display names and state mappings from Firebase"""
        try:
            async with self.session.get(self.states_url) as response:
                if response.status != 200:
                    return
                    
                states_data = await response.json()
            
            for state_info in states_data.values():
                if not isinstance(state_info, dict) or 'Symbols' not in state_info:
                    continue
                    
                state_name = state_info.get('name', '')
                
                for symbol_key, symbol_info in state_info['Symbols'].items():
                    if isinstance(symbol_info, dict):
                        self.symbol_state_mapping[symbol_key] = state_name
                        if 'displayName' in symbol_info:
                            self.symbol_display_names[symbol_key] = symbol_info['displayName']
            
        except Exception:
            pass
    
