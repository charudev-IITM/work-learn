import asyncio
import aiohttp
import websockets
import json
import gzip
import zlib
from typing import List, Dict, Optional
import logging
import re
import time
from datetime import datetime
from collections import deque
from ..base.scraper import BaseScraper, RateData, ScraperConfig, ScraperType
from app.database.connection import redis_manager

logger = logging.getLogger(__name__)

# Performance optimization constants
MAX_RECONNECT_ATTEMPTS = 5
BASE_RETRY_DELAY = 1.0
MAX_RETRY_DELAY = 60.0
MESSAGE_BUFFER_SIZE = 100

class CSVBullionScraper(BaseScraper):
    """Socket.IO WebSocket scraper for https://csvbullion.com with support for both refProduct and mainProduct events"""
    
    def __init__(self):
        config = ScraperConfig(
            competitor_name="csvbullion",
            base_url="https://csvbullion.com/",
            scraper_type=ScraperType.WEBSOCKET,
            poll_interval=1,
            headers={
                'Origin': 'https://csvbullion.com',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
            }
        )
        super().__init__(config)
        
        # Connection state
        self.websocket: Optional[websockets.WebSocketServerProtocol] = None
        self.session_id: Optional[str] = None
        self.websocket_url = "wss://csvbullion.com:10001/socket.io/"

        # Performance optimizations
        self.reconnect_attempts = 0
        self.last_reconnect = 0
        self._has_connected = False
        self.message_buffer = deque(maxlen=MESSAGE_BUFFER_SIZE)
        self.rate_cache = {}  # Cache for duplicate detection
        self.last_heartbeat = time.time()

        # Optimized decompression - cache successful method
        self._compression_method = None

        # Redis storage for rates - no batching, direct storage
        self.redis_key_prefix = "csvbullion_rate:"

        # Store original scraper type for reset on restart
        self._original_scraper_type = ScraperType.WEBSOCKET

    def reset_connection_state(self):
        """Reset connection state for clean restart"""
        self.reconnect_attempts = 0
        self.last_reconnect = 0
        self.websocket = None
        self.session_id = None
        self.config.scraper_type = self._original_scraper_type
        self._compression_method = None
        self.last_heartbeat = time.time()
        self._stop_event.clear()
        self.is_running = True
        logger.info("Reset csvbullion connection state for clean restart")

    async def start(self):
        """Initialize Socket.IO connection"""
        await super().start()
        self.reset_connection_state()
        await self._connect_socketio()
        
    async def stop(self):
        """Clean up Socket.IO connection"""
        if self.websocket:
            await self.websocket.close()
            self.websocket = None
        await super().stop()
        
    async def _get_session_id(self):
        """Get Socket.IO session ID via HTTP handshake"""
        try:
            handshake_url = "https://csvbullion.com:10001/socket.io/?EIO=4&transport=polling"
            
            # Use the parent scraper's HTTP session instead of creating a new one
            if not self.session:
                logger.error("HTTP session not initialized")
                return False
                
            async with self.session.get(handshake_url, headers=self.config.headers) as response:
                if response.status == 200:
                    data = await response.text()
                    if data.startswith('0{'):
                        json_data = json.loads(data[1:])  # Remove the '0' prefix
                        self.session_id = json_data.get('sid')
                        logger.info(f"✅ Got Socket.IO session ID: {self.session_id}")
                        return True
            return False
            
        except Exception as e:
            logger.error(f"❌ Failed to get Socket.IO session ID: {e}")
            return False
    
    async def _connect_socketio(self):
        """Establish Socket.IO WebSocket connection with exponential backoff"""
        current_time = time.time()
        
        # Implement exponential backoff
        if self.reconnect_attempts > 0:
            delay = min(BASE_RETRY_DELAY * (2 ** (self.reconnect_attempts - 1)), MAX_RETRY_DELAY)
            if current_time - self.last_reconnect < delay:
                return False
        
        try:
            self.last_reconnect = current_time
            self.reconnect_attempts += 1
            
            if self.reconnect_attempts > MAX_RECONNECT_ATTEMPTS:
                logger.warning(f"Max reconnection attempts ({MAX_RECONNECT_ATTEMPTS}) reached, will retry after backoff")
                # Reset attempts so future restart cycles can try again
                self.reconnect_attempts = 0
                return False
            
            # First get session ID via HTTP handshake
            if not await self._get_session_id():
                raise Exception("Failed to get Socket.IO session ID")
            
            # Connect to WebSocket with session ID
            ws_url = f"{self.websocket_url}?EIO=4&transport=websocket&sid={self.session_id}"
            
            self.websocket = await websockets.connect(
                ws_url,
                extra_headers=self.config.headers,
                ping_interval=20,
                ping_timeout=20  # Increased from 10 to reduce keepalive timeout disconnects
            )
            
            # Send upgrade sequence
            await self.websocket.send("2probe")
            response = await asyncio.wait_for(self.websocket.recv(), timeout=10)
            
            if response == "3probe":
                await self.websocket.send("5")  # Upgrade confirmation
                
                # Connect to default namespace
                await self.websocket.send("40")
                await asyncio.sleep(0.3)  # Reduced delay
                
                # Register as 'csvbullion' client
                await self.websocket.send('42["client","csvbullion"]')
                
                # Reset reconnection counter on success
                self.reconnect_attempts = 0
                self.last_heartbeat = current_time

                if not self._has_connected:
                    logger.info("✅ Connected to Socket.IO WebSocket")
                    self._has_connected = True
                
                return True
            else:
                raise Exception(f"Unexpected upgrade response: {response}")
            
        except Exception as e:
            if self.reconnect_attempts <= 2:  # Reduce log noise
                logger.warning(f"Socket.IO connection failed (attempt {self.reconnect_attempts}): {e}")
            
            return False
            
    # NOTE: Removed _send_subscriptions - not needed with 'csvbullion' client registration
    # The server automatically sends mainProduct and refProduct events after client registration

    async def scrape_rates(self) -> List[RateData]:
        """Legacy method for compatibility - not used in event-driven mode"""
        if self.config.scraper_type == ScraperType.WEBSOCKET and self.websocket:
            # In event-driven mode, this method is not used
            # Rates are processed in _listen_for_events
            logger.debug("scrape_rates called in event-driven mode - returning empty list")
            return []
        else:
            return await self._scrape_via_http()
            
    async def _parse_socketio_message(self, message: str) -> List[RateData]:
        """Parse Socket.IO message and handle all event types"""
        rates = []
        
        try:
            # Handle ping/pong asynchronously
            if message.startswith('2'):
                await self._send_pong()  # Send pong immediately to maintain connection
                return []
            elif message.startswith('40'):
                logger.info("✅ Connected to Socket.IO namespace")
                return []
            elif message.startswith('41'):
                logger.warning("⚠️ Disconnected from Socket.IO namespace")
                return []
                
            # Handle binary event messages (45)
            if message.startswith('45'):
                try:
                    # Format: 45[attachment_count]-["event_name", data_with_placeholders]
                    if '-' in message:
                        parts = message.split('-', 1)
                        if len(parts) == 2:
                            attachment_count = parts[0][2:]  # Remove '45' prefix
                            json_data = parts[1]
                            
                            if json_data.startswith('['):
                                data = json.loads(json_data)
                                if isinstance(data, list) and len(data) >= 2:
                                    event_name = data[0]
                                    event_data = data[1]
                                    
                                    if event_name in ['refProduct', 'mainProduct']:
                                        # Wait for binary attachment
                                        try:
                                            binary_data = await asyncio.wait_for(self.websocket.recv(), timeout=10)
                                            if isinstance(binary_data, bytes):
                                                rates = await self._parse_binary_attachment(binary_data, event_name)
                                                if rates:
                                                    return rates
                                        except asyncio.TimeoutError:
                                            logger.debug(f"No binary attachment for {event_name}")
                except json.JSONDecodeError as e:
                    logger.debug(f"JSON decode error in binary message: {e}")
                    
            # Handle regular event messages (42)
            elif message.startswith('42'):
                try:
                    json_data = message[2:]  # Remove '42' prefix
                    if json_data.startswith('['):
                        data = json.loads(json_data)
                        if isinstance(data, list) and len(data) >= 2:
                            event_name = data[0]
                            event_data = data[1]
                            
                            logger.info(f"🎯 Event: {event_name}")
                            
                            if event_name == 'mainProduct':
                                rates = await self._parse_main_product_data(event_data)
                            elif event_name == 'refProduct':
                                rates = await self._parse_ref_product_data(event_data)
                            elif event_name == 'refDetails':
                                # Store reference details for later use
                                logger.info(f"📋 Received refDetails: {str(event_data)[:200]}")
                                
                            return rates
                except json.JSONDecodeError as e:
                    logger.debug(f"JSON decode error: {e}")
                    
        except Exception as e:
            logger.error(f"❌ Error parsing Socket.IO message: {e}")
            
        return rates
    
    async def _parse_binary_attachment(self, binary_data: bytes, event_type: str) -> List[RateData]:
        """Parse binary attachment data using pako.inflate equivalent decompression"""
        rates = []
        
        try:
            json_str = None
            data = None
            
            # Try direct JSON decode first
            try:
                json_str = binary_data.decode('utf-8')
                data = json.loads(json_str)
                logger.debug(f"Direct JSON decode successful")
            except (UnicodeDecodeError, json.JSONDecodeError):
                # Use pako.inflate equivalent - try multiple decompression methods
                decompressed_data = self._pako_inflate(binary_data)
                if decompressed_data:
                    try:
                        json_str = decompressed_data.decode('utf-8')
                        data = json.loads(json_str)
                    except (UnicodeDecodeError, json.JSONDecodeError) as e:
                        logger.error(f"Failed to decode decompressed data: {e}")
                        return []
                else:
                    logger.error(f"Failed to decompress binary data: {binary_data[:20]}")
                    return []
            
            # Parse based on event type (same as JavaScript logic)
            if event_type == 'mainProduct' and data:
                rates = await self._parse_main_product_data(data)
            elif event_type == 'refProduct' and data:
                rates = await self._parse_ref_product_data(data)
                
        except Exception as e:
            logger.error(f"❌ Error parsing binary attachment: {e}")
            
        return rates
    
    def _pako_inflate(self, data: bytes) -> Optional[bytes]:
        """Optimized decompression with method caching"""
        try:
            # Use cached method first if available
            if self._compression_method:
                try:
                    if self._compression_method == 'raw_deflate':
                        return zlib.decompress(data, -zlib.MAX_WBITS)
                    elif self._compression_method == 'zlib':
                        return zlib.decompress(data)
                    elif self._compression_method == 'gzip':
                        return gzip.decompress(data)
                    elif isinstance(self._compression_method, int):
                        return zlib.decompress(data, self._compression_method)
                except (zlib.error, gzip.BadGzipFile, OSError):
                    # Cached method failed, try others
                    self._compression_method = None
            
            # Try all methods and cache the successful one
            methods = [
                ('raw_deflate', lambda: zlib.decompress(data, -zlib.MAX_WBITS)),
                ('zlib', lambda: zlib.decompress(data)),
                ('gzip', lambda: gzip.decompress(data)),
            ]
            
            # Add wbits variations
            for wbits in [15, -15, 15 + 16, 15 + 32]:
                methods.append((wbits, lambda w=wbits: zlib.decompress(data, w)))
            
            for method_name, decompress_func in methods:
                try:
                    result = decompress_func()
                    self._compression_method = method_name  # Cache successful method
                    return result
                except (zlib.error, gzip.BadGzipFile, OSError):
                    continue
                    
            logger.debug(f"All decompression methods failed for {len(data)} bytes")
            return None
            
        except Exception as e:
            logger.error(f"Error in optimized decompression: {e}")
            return None
    
    async def _parse_main_product_data(self, data) -> List[RateData]:
        """Parse mainProduct event data (physical bullion rates)"""
        rates = []
        
        try:
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        rate = self._create_main_product_rate(item)
                        if rate:
                            rates.append(rate)
            elif isinstance(data, dict):
                rate = self._create_main_product_rate(data)
                if rate:
                    rates.append(rate)
                    
        except Exception as e:
            logger.error(f"❌ Error parsing mainProduct: {e}")
            
        return rates
    
    async def _parse_ref_product_data(self, data) -> List[RateData]:
        """Parse refProduct event data (futures rates)"""
        rates = []
        
        try:
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        rate = self._create_ref_product_rate(item)
                        if rate:
                            rates.append(rate)
            elif isinstance(data, dict):
                rate = self._create_ref_product_rate(data)
                if rate:
                    rates.append(rate)
                    
        except Exception as e:
            logger.error(f"❌ Error parsing refProduct: {e}")
            
        return rates
    
    def _create_main_product_rate(self, data: dict) -> RateData:
        """Create RateData from mainProduct structure"""
        try:
            # mainProduct structure: name, bid, ask, high, low, src, iv, desc, buy, sell, Stock
            script_name = data.get('name', data.get('Name', 'Unknown'))
            
            bid_rate = self._parse_rate(data.get('bid'))
            ask_rate = self._parse_rate(data.get('ask'))
            high_rate = self._parse_rate(data.get('high'))
            low_rate = self._parse_rate(data.get('low'))
            
            # Check if should be displayed
            is_display = data.get('iv', True)
            if not is_display:
                return None
            
            return RateData(
                script_name=script_name,
                symbol=script_name.upper().replace(' ', '_'),
                buy_rate=bid_rate,
                sell_rate=ask_rate,
                high_rate=high_rate,
                low_rate=low_rate
            )
            
        except Exception as e:
            logger.debug(f"Error creating mainProduct rate: {e}")
            return None
    
    def _create_ref_product_rate(self, data: dict) -> RateData:
        """Create RateData from refProduct structure"""
        try:
            # refProduct structure: symbol, Name, Bid, Ask, High, Low, LTP, Difference, Time, etc.
            script_name = data.get('Name', data.get('symbol', 'Unknown'))
            symbol = data.get('symbol', script_name).upper()
            
            # Parse rates from string values
            bid_rate = self._parse_rate(data.get('Bid'))
            ask_rate = self._parse_rate(data.get('Ask'))
            high_rate = self._parse_rate(data.get('High'))
            low_rate = self._parse_rate(data.get('Low'))
            
            # Only create rate if we have at least bid or ask
            if bid_rate or ask_rate:
                return RateData(
                    script_name=script_name,
                    symbol=symbol,
                    buy_rate=bid_rate,
                    sell_rate=ask_rate,
                    high_rate=high_rate,
                    low_rate=low_rate
                )
            else:
                logger.debug(f"No valid rates for {script_name}: Bid={data.get('Bid')}, Ask={data.get('Ask')}")
                return None
            
        except Exception as e:
            logger.error(f"Error creating refProduct rate: {e}")
            return None
    
    async def _parse_binary_message(self, message: bytes) -> List[RateData]:
        """Parse binary Socket.IO messages"""
        try:
            text = message.decode('utf-8')
            return await self._parse_socketio_message(text)
        except UnicodeDecodeError:
            logger.debug("Binary message couldn't be decoded as UTF-8")
            return []
    
    async def _send_pong(self):
        """Send pong response to ping"""
        try:
            if self.websocket:
                await self.websocket.send("3")
        except Exception as e:
            logger.debug(f"Error sending pong: {e}")
    
    async def _scrape_via_http(self) -> List[RateData]:
        """Fallback HTTP scraping"""
        try:
            from bs4 import BeautifulSoup
            
            html_content = await self._make_request(self.config.base_url)
            if not html_content:
                return []
                
            soup = BeautifulSoup(html_content, 'html.parser')
            rates = []
            
            # Basic HTML parsing fallback
            rate_elements = soup.find_all(['div', 'span'], class_=['spot-rate-cover'])
            
            for element in rate_elements:
                try:
                    rate_data = self._parse_html_rate_element(element)
                    if rate_data:
                        rates.append(rate_data)
                except Exception as e:
                    logger.debug(f"Error parsing HTML element: {e}")
                    
            return rates
            
        except Exception as e:
            logger.error(f"❌ HTTP scraping error: {e}")
            return []
    
    def _parse_html_rate_element(self, element) -> RateData:
        """Parse rate from HTML element"""
        try:
            text = element.get_text().strip()
            if 'gold' in text.lower():
                script_name = 'Gold'
            elif 'silver' in text.lower():
                script_name = 'Silver'
            else:
                script_name = 'Unknown'
                
            # Extract rates from text
            numbers = re.findall(r'\d+(?:\.\d+)?', text)
            buy_rate = self._parse_rate(numbers[0]) if numbers else None
            sell_rate = self._parse_rate(numbers[1]) if len(numbers) > 1 else buy_rate
            
            return RateData(
                script_name=script_name,
                symbol=script_name.upper(),
                buy_rate=buy_rate,
                sell_rate=sell_rate
            )
        except Exception as e:
            logger.debug(f"Error parsing HTML rate: {e}")
            return None
        
    async def get_available_scripts(self) -> List[Dict[str, str]]:
        """Get available scripts from csvbullion - Let rate service discover dynamically"""
        # Don't hardcode scripts like other scrapers
        # The rate service will automatically discover scripts from actual received rate data
        return []
        
    async def run_continuous(self, callback=None):
        """Override continuous run for Socket.IO WebSocket with proper event-driven architecture"""
        if self.config.scraper_type == ScraperType.WEBSOCKET:
            logger.info(f"Starting Socket.IO event-driven scraping for {self.config.competitor_name}")
            consecutive_failures = 0

            while self.is_running and not self._stop_event.is_set():
                try:
                    # Establish connection if needed
                    if not self.websocket:
                        connected = await self._connect_socketio()
                        if not connected:
                            consecutive_failures += 1
                            # Exponential backoff: 10s, 20s, 40s, max 120s
                            delay = min(10 * (2 ** (consecutive_failures - 1)), 120)
                            logger.warning(f"WebSocket connection failed (attempt {consecutive_failures}), retrying in {delay}s")
                            await asyncio.sleep(delay)
                            continue

                    if self.websocket:
                        consecutive_failures = 0  # Reset on successful connection
                        # Listen continuously for events (event-driven, not polling)
                        await self._listen_for_events(callback)

                except Exception as e:
                    logger.error(f"Error in continuous event listening: {e}")
                    self.websocket = None
                    self.session_id = None
                    consecutive_failures += 1
                    delay = min(10 * (2 ** (consecutive_failures - 1)), 120)
                    await asyncio.sleep(delay)
        else:
            await super().run_continuous(callback)
    
    async def _listen_for_events(self, callback=None):
        """Optimized event listener with reduced logging and batching"""
        event_count = 0
        last_log_time = time.time()
        
        try:
            while self.is_running and self.websocket and not self._stop_event.is_set():
                try:
                    # Listen for messages with timeout
                    message = await asyncio.wait_for(self.websocket.recv(), timeout=30)
                    self.last_heartbeat = time.time()
                    
                    rates = []
                    if isinstance(message, str):
                        # Add to message buffer for debugging (limited size)
                        self.message_buffer.append(message[:100])
                        rates = await self._parse_socketio_message(message)
                    elif isinstance(message, bytes):
                        rates = await self._parse_binary_message(message)
                    
                    if rates:
                        # Use callback (pub/sub) path instead of direct Redis storage
                        if callback:
                            await callback(self.config.competitor_name, rates)
                        event_count += len(rates)

                        # Batch logging to reduce noise
                        current_time = time.time()
                        if current_time - last_log_time >= 10:  # Log every 10 seconds
                            logger.info(f"Processed {event_count} rates for csvbullion")
                            last_log_time = current_time
                            event_count = 0
                    
                except asyncio.TimeoutError:
                    # Check heartbeat
                    if time.time() - self.last_heartbeat > 60:
                        logger.warning("No heartbeat for 60 seconds, connection may be stale")
                        break
                    continue
                        
        except websockets.exceptions.ConnectionClosed as e:
            logger.warning(f"Socket.IO connection closed: {e}")
            self.websocket = None
            self.session_id = None
            raise
            
        except Exception as e:
            logger.error(f"Error in Socket.IO event listener: {e}")
            self.websocket = None
            self.session_id = None
            raise
    
    def _filter_duplicate_rates(self, rates: List[RateData]) -> List[RateData]:
        """Filter only TRUE duplicates - always send rate changes immediately"""
        unique_rates = []
        current_time = time.time()
        
        # Clean old cache entries (older than 2 minutes - just for memory management)
        cutoff_time = current_time - 120
        self.rate_cache = {k: v for k, v in self.rate_cache.items() if v['timestamp'] > cutoff_time}
        
        for rate in rates:
            # Create comprehensive rate signature including all values
            rate_signature = f"{rate.symbol}_{rate.buy_rate}_{rate.sell_rate}_{rate.high_rate}_{rate.low_rate}"
            
            cached_entry = self.rate_cache.get(rate_signature)
            
            # Always send if:
            # 1. Never seen this rate combination before
            # 2. ANY rate value has changed (guaranteed by signature)
            if not cached_entry:
                self.rate_cache[rate_signature] = {
                    'timestamp': current_time,
                    'buy': rate.buy_rate,
                    'sell': rate.sell_rate,
                    'high': rate.high_rate,
                    'low': rate.low_rate
                }
                unique_rates.append(rate)
            # If exact same rates, it's truly duplicate - skip to avoid spam
            # This only filters identical rates, never delays changed rates
        
        return unique_rates
    
    async def _store_rates_in_redis(self, rates: List[RateData]):
        """Store rates directly in Redis for WebSocket broadcasting service to pick up"""
        if not redis_manager.async_redis_client:
            logger.warning("Redis not available, cannot store CSV Bullion rates")
            return
            
        try:
            current_time = datetime.utcnow()
            keys_to_track = []

            for rate in rates:
                rate_data = {
                    'script_name': rate.script_name,
                    'symbol': rate.symbol,
                    'buy_rate': rate.buy_rate,
                    'sell_rate': rate.sell_rate,
                    'high_rate': rate.high_rate,
                    'low_rate': rate.low_rate,
                    'timestamp': current_time.isoformat(),
                    'volume': rate.volume
                }

                redis_key = f"{self.redis_key_prefix}{rate.symbol}"
                await redis_manager.set_json(redis_key, rate_data, expire=3600)
                keys_to_track.append(redis_key)

            # Batch SADD - single round-trip instead of N
            if keys_to_track:
                await redis_manager.sadd("csvbullion_active_keys", *keys_to_track)
                
            # Also store a general "last update" timestamp for the scraper
            await redis_manager.set_json("csvbullion:last_update", {
                'timestamp': current_time.isoformat(),
                'rate_count': len(rates)
            }, expire=3600)
                
            logger.debug(f"Stored {len(rates)} CSV Bullion rates in Redis with timestamp {current_time}")
            
        except Exception as e:
            logger.error(f"Error storing CSV Bullion rates in Redis: {e}")