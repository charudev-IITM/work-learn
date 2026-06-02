from abc import abstractmethod
from typing import List, Dict, Optional
import logging
import re
import time
from ..base.scraper import BaseScraper, RateData, ScraperConfig, ScraperType

logger = logging.getLogger(__name__)

class APIBaseScraper(BaseScraper):
    """Base scraper for API-based bullion dealers"""

    def __init__(self, config: ScraperConfig):
        super().__init__(config)

    def _generate_symbol(self, script_name: str) -> str:
        """Generate a clean symbol from script name"""
        symbol = re.sub(r'[^\w\s]', '', script_name)
        symbol = re.sub(r'\s+', '_', symbol)
        return symbol.upper()[:50]

    @abstractmethod
    async def get_api_url(self) -> str:
        """Get the API URL with timestamp"""
        pass
        
    @abstractmethod
    def parse_response_data(self, response_text: str) -> List[RateData]:
        """Parse the API response into RateData objects"""
        pass
        
    async def scrape_rates(self) -> List[RateData]:
        """Scrape rates using API calls"""
        try:
            api_url = await self.get_api_url()
            response_text = await self._make_request(api_url)
            
            if not response_text:
                logger.error(f"Failed to fetch data from {api_url}")
                return []
                
            rates = self.parse_response_data(response_text)
            logger.debug(f"Scraped {len(rates)} rates from {self.config.competitor_name}")
            return rates
            
        except Exception as e:
            logger.error(f"Error scraping rates for {self.config.competitor_name}: {e}")
            return []

class TabDelimitedAPIScraper(APIBaseScraper):
    """Base scraper for tab-delimited API responses"""

    async def get_api_url(self) -> str:
        """Default: append timestamp query param to base URL"""
        timestamp = int(time.time() * 1000)
        return f"{self.config.base_url}?_={timestamp}"

    def parse_response_data(self, response_text: str) -> List[RateData]:
        """Parse tab-delimited response data"""
        rates = []
        lines = response_text.strip().split('\n')
        
        logger.debug(f"Parsing {len(lines)} lines for {self.config.competitor_name}")
        
        for line_num, line in enumerate(lines):
            try:
                # Skip empty lines and lines ending with %
                if not line.strip() or line.strip().endswith('%'):
                    continue
                    
                parts = line.split('\t')
                # Remove empty parts from beginning (handle leading tabs)
                parts = [p for p in parts if p.strip()]
                
                if len(parts) < 5:
                    logger.debug(f"Line {line_num}: Not enough parts ({len(parts)}): {line[:50]}...")
                    continue
                    
                # Extract data from tab-delimited format
                # Format: ID    Name    Buy    Sell    High    Low    [Additional fields]
                rate_id = parts[0].strip()
                script_name = parts[1].strip()
                
                # Skip if script name is empty or just numbers
                if not script_name or script_name.isdigit():
                    logger.debug(f"Line {line_num}: Skipping empty or numeric script name: '{script_name}'")
                    continue
                    
                # Parse rates - handle "-" as None
                buy_rate = self._parse_rate(parts[2]) if parts[2].strip() != '-' else None
                sell_rate = self._parse_rate(parts[3]) if parts[3].strip() != '-' else None
                high_rate = self._parse_rate(parts[4]) if len(parts) > 4 and parts[4].strip() != '-' else None
                low_rate = self._parse_rate(parts[5]) if len(parts) > 5 and parts[5].strip() != '-' else None
                
                # Create symbol from script name
                symbol = self._generate_symbol(script_name)
                
                rate_data = RateData(
                    script_name=script_name,
                    symbol=symbol,
                    buy_rate=buy_rate,
                    sell_rate=sell_rate,
                    high_rate=high_rate,
                    low_rate=low_rate
                )
                rates.append(rate_data)
                logger.debug(f"Line {line_num}: Successfully parsed {script_name}")
                
            except Exception as e:
                logger.error(f"Error parsing line {line_num} '{line[:50]}...': {e}")
                continue
                
        logger.debug(f"Successfully parsed {len(rates)} rates for {self.config.competitor_name}")
        return rates
        
class RecordTypedAPIScraper(APIBaseScraper):
    """Base scraper for JSON API responses"""
    
    def parse_response_data(self, response_text: str) -> List[RateData]:
        """Parse JSON response data"""
        rates = []
        
        try:
            # For shivsahai format which is line-separated values
            lines = response_text.strip().split('\n')
            
            for line in lines:
                try:
                    parts = line.split('\t')
                    if len(parts) < 4:
                        continue
                        
                    # Parse different record types
                    record_type = parts[0].strip()
                    
                    if record_type == '3':  # Individual instrument rates
                        if len(parts) >= 9:
                            rate_id = parts[1]
                            script_name = parts[2].strip('"')
                            buy_rate = self._parse_rate(parts[4]) if parts[4].strip() != '-' else None
                            sell_rate = self._parse_rate(parts[5]) if parts[5].strip() != '-' else None
                            high_rate = self._parse_rate(parts[6]) if parts[6].strip() != '-' else None
                            low_rate = self._parse_rate(parts[7]) if parts[7].strip() != '-' else None
                            
                            if script_name and not script_name.isdigit():
                                symbol = self._generate_symbol(script_name)
                                rate_data = RateData(
                                    script_name=script_name,
                                    symbol=symbol,
                                    buy_rate=buy_rate,
                                    sell_rate=sell_rate,
                                    high_rate=high_rate,
                                    low_rate=low_rate
                                )
                                rates.append(rate_data)
                                
                    elif record_type in ['1', '2']:  # Spot/Future rates
                        if len(parts) >= 7:
                            script_name = parts[2].strip()
                            buy_rate = self._parse_rate(parts[3]) if parts[3].strip() != '-' else None
                            sell_rate = self._parse_rate(parts[4]) if parts[4].strip() != '-' else None
                            high_rate = self._parse_rate(parts[5]) if parts[5].strip() != '-' else None
                            low_rate = self._parse_rate(parts[6]) if parts[6].strip() != '-' else None
                            
                            if script_name and not script_name.isdigit():
                                symbol = self._generate_symbol(script_name)
                                rate_data = RateData(
                                    script_name=script_name,
                                    symbol=symbol,
                                    buy_rate=buy_rate,
                                    sell_rate=sell_rate,
                                    high_rate=high_rate,
                                    low_rate=low_rate
                                )
                                rates.append(rate_data)
                                
                except Exception as e:
                    logger.debug(f"Error parsing shivsahai line '{line}': {e}")
                    continue
                    
        except Exception as e:
            logger.error(f"Error parsing JSON response: {e}")
            
        return rates
        
