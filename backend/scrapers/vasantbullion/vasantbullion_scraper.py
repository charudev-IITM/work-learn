import asyncio
import aiohttp
import websockets
import json
import gzip
import zlib
from typing import List, Dict, Optional
import logging
import time
from datetime import datetime
from collections import deque
from ..base.scraper import BaseScraper, RateData, ScraperConfig, ScraperType
from app.database.connection import redis_manager

logger = logging.getLogger(__name__)

MAX_RECONNECT_ATTEMPTS = 5
BASE_RETRY_DELAY = 1.0
MAX_RETRY_DELAY = 60.0
MESSAGE_BUFFER_SIZE = 100


class VasantBullionScraper(BaseScraper):
    """Socket.IO WebSocket scraper for http://vasantbullion.in"""

    def __init__(self):
        config = ScraperConfig(
            competitor_name="vasantbullion",
            base_url="http://vasantbullion.in/",
            scraper_type=ScraperType.WEBSOCKET,
            poll_interval=1,
            headers={
                'Origin': 'http://vasantbullion.in',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
            }
        )
        super().__init__(config)

        self.websocket: Optional[websockets.WebSocketServerProtocol] = None
        self.session_id: Optional[str] = None
        self.websocket_url = "ws://vasantbullion.in:10001/socket.io/"

        self.reconnect_attempts = 0
        self.last_reconnect = 0
        self.message_buffer = deque(maxlen=MESSAGE_BUFFER_SIZE)
        self.rate_cache = {}
        self.last_heartbeat = time.time()

        self._compression_method = None

        self.redis_key_prefix = "vasantbullion_rate:"
        self._original_scraper_type = ScraperType.WEBSOCKET

    def reset_connection_state(self):
        self.reconnect_attempts = 0
        self.last_reconnect = 0
        self.websocket = None
        self.session_id = None
        self.config.scraper_type = self._original_scraper_type
        self._compression_method = None
        self.last_heartbeat = time.time()
        self._stop_event.clear()
        self.is_running = True
        logger.info("Reset vasantbullion connection state for clean restart")

    async def start(self):
        await super().start()
        self.reset_connection_state()
        await self._connect_socketio()

    async def stop(self):
        if self.websocket:
            await self.websocket.close()
            self.websocket = None
        await super().stop()

    async def _get_session_id(self):
        try:
            handshake_url = "http://vasantbullion.in:10001/socket.io/?EIO=4&transport=polling"

            if not self.session:
                logger.error("HTTP session not initialized")
                return False

            async with self.session.get(handshake_url, headers=self.config.headers) as response:
                if response.status == 200:
                    data = await response.text()
                    if data.startswith('0{'):
                        json_data = json.loads(data[1:])
                        self.session_id = json_data.get('sid')
                        logger.info(f"Got Socket.IO session ID: {self.session_id}")
                        return True
            return False

        except Exception as e:
            logger.error(f"Failed to get Socket.IO session ID: {e}")
            return False

    async def _connect_socketio(self):
        current_time = time.time()

        if self.reconnect_attempts > 0:
            delay = min(BASE_RETRY_DELAY * (2 ** (self.reconnect_attempts - 1)), MAX_RETRY_DELAY)
            if current_time - self.last_reconnect < delay:
                return False

        try:
            self.last_reconnect = current_time
            self.reconnect_attempts += 1

            if self.reconnect_attempts > MAX_RECONNECT_ATTEMPTS:
                logger.warning(f"Max reconnection attempts ({MAX_RECONNECT_ATTEMPTS}) reached")
                self.reconnect_attempts = 0
                return False

            if not await self._get_session_id():
                raise Exception("Failed to get Socket.IO session ID")

            ws_url = f"{self.websocket_url}?EIO=4&transport=websocket&sid={self.session_id}"

            self.websocket = await websockets.connect(
                ws_url,
                extra_headers=self.config.headers,
                ping_interval=20,
                ping_timeout=10
            )

            await self.websocket.send("2probe")
            response = await asyncio.wait_for(self.websocket.recv(), timeout=10)

            if response == "3probe":
                await self.websocket.send("5")
                await self.websocket.send("40")
                await asyncio.sleep(0.3)

                # Register as 'vasant' client (matches prjName from JS)
                await self.websocket.send('42["client","vasant"]')

                is_first_connection = self.reconnect_attempts <= 1
                self.reconnect_attempts = 0
                self.last_heartbeat = current_time

                if is_first_connection:
                    logger.info("Connected to vasantbullion Socket.IO WebSocket")

                return True
            else:
                raise Exception(f"Unexpected upgrade response: {response}")

        except Exception as e:
            if self.reconnect_attempts <= 2:
                logger.warning(f"Socket.IO connection failed (attempt {self.reconnect_attempts}): {e}")
            return False

    async def scrape_rates(self) -> List[RateData]:
        if self.config.scraper_type == ScraperType.WEBSOCKET and self.websocket:
            return []
        return []

    async def _parse_socketio_message(self, message: str) -> List[RateData]:
        rates = []

        try:
            if message.startswith('2'):
                await self._send_pong()
                return []
            elif message.startswith('40'):
                return []
            elif message.startswith('41'):
                logger.warning("Disconnected from Socket.IO namespace")
                return []

            if message.startswith('45'):
                try:
                    if '-' in message:
                        parts = message.split('-', 1)
                        if len(parts) == 2:
                            json_data = parts[1]
                            if json_data.startswith('['):
                                data = json.loads(json_data)
                                if isinstance(data, list) and len(data) >= 2:
                                    event_name = data[0]
                                    if event_name in ['refProduct', 'mainProduct']:
                                        try:
                                            binary_data = await asyncio.wait_for(self.websocket.recv(), timeout=10)
                                            if isinstance(binary_data, bytes):
                                                rates = await self._parse_binary_attachment(binary_data, event_name)
                                                if rates:
                                                    return rates
                                        except asyncio.TimeoutError:
                                            pass
                except json.JSONDecodeError:
                    pass

            elif message.startswith('42'):
                try:
                    json_data = message[2:]
                    if json_data.startswith('['):
                        data = json.loads(json_data)
                        if isinstance(data, list) and len(data) >= 2:
                            event_name = data[0]
                            event_data = data[1]

                            if event_name == 'mainProduct':
                                rates = await self._parse_main_product_data(event_data)
                            elif event_name == 'refProduct':
                                rates = await self._parse_ref_product_data(event_data)

                            return rates
                except json.JSONDecodeError:
                    pass

        except Exception as e:
            logger.error(f"Error parsing Socket.IO message: {e}")

        return rates

    async def _parse_binary_attachment(self, binary_data: bytes, event_type: str) -> List[RateData]:
        rates = []

        try:
            json_str = None
            data = None

            try:
                json_str = binary_data.decode('utf-8')
                data = json.loads(json_str)
            except (UnicodeDecodeError, json.JSONDecodeError):
                decompressed_data = self._pako_inflate(binary_data)
                if decompressed_data:
                    try:
                        json_str = decompressed_data.decode('utf-8')
                        data = json.loads(json_str)
                    except (UnicodeDecodeError, json.JSONDecodeError):
                        return []
                else:
                    return []

            if event_type == 'mainProduct' and data:
                rates = await self._parse_main_product_data(data)
            elif event_type == 'refProduct' and data:
                rates = await self._parse_ref_product_data(data)

        except Exception as e:
            logger.error(f"Error parsing binary attachment: {e}")

        return rates

    def _pako_inflate(self, data: bytes) -> Optional[bytes]:
        try:
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
                    self._compression_method = None

            methods = [
                ('raw_deflate', lambda: zlib.decompress(data, -zlib.MAX_WBITS)),
                ('zlib', lambda: zlib.decompress(data)),
                ('gzip', lambda: gzip.decompress(data)),
            ]

            for wbits in [15, -15, 15 + 16, 15 + 32]:
                methods.append((wbits, lambda w=wbits: zlib.decompress(data, w)))

            for method_name, decompress_func in methods:
                try:
                    result = decompress_func()
                    self._compression_method = method_name
                    return result
                except (zlib.error, gzip.BadGzipFile, OSError):
                    continue

            return None

        except Exception as e:
            logger.error(f"Error in decompression: {e}")
            return None

    async def _parse_main_product_data(self, data) -> List[RateData]:
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
            logger.error(f"Error parsing mainProduct: {e}")

        return rates

    async def _parse_ref_product_data(self, data) -> List[RateData]:
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
            logger.error(f"Error parsing refProduct: {e}")

        return rates

    def _create_main_product_rate(self, data: dict) -> RateData:
        try:
            script_name = data.get('name', data.get('Name', 'Unknown'))

            bid_rate = self._parse_rate(data.get('bid'))
            ask_rate = self._parse_rate(data.get('ask'))
            high_rate = self._parse_rate(data.get('high'))
            low_rate = self._parse_rate(data.get('low'))

            is_display = data.get('isView', data.get('iv', True))
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
        try:
            script_name = data.get('Name', data.get('symbol', 'Unknown'))
            symbol = data.get('symbol', script_name).upper()

            bid_rate = self._parse_rate(data.get('Bid'))
            ask_rate = self._parse_rate(data.get('Ask'))
            high_rate = self._parse_rate(data.get('High'))
            low_rate = self._parse_rate(data.get('Low'))

            if bid_rate or ask_rate:
                return RateData(
                    script_name=script_name,
                    symbol=symbol,
                    buy_rate=bid_rate,
                    sell_rate=ask_rate,
                    high_rate=high_rate,
                    low_rate=low_rate
                )
            return None
        except Exception as e:
            logger.error(f"Error creating refProduct rate: {e}")
            return None

    async def _send_pong(self):
        try:
            if self.websocket:
                await self.websocket.send("3")
        except Exception:
            pass

    async def get_available_scripts(self) -> List[Dict[str, str]]:
        return []

    async def run_continuous(self, callback=None):
        if self.config.scraper_type == ScraperType.WEBSOCKET:
            logger.info(f"Starting Socket.IO event-driven scraping for {self.config.competitor_name}")
            consecutive_failures = 0

            while self.is_running and not self._stop_event.is_set():
                try:
                    if not self.websocket:
                        connected = await self._connect_socketio()
                        if not connected:
                            consecutive_failures += 1
                            delay = min(10 * (2 ** (consecutive_failures - 1)), 120)
                            logger.warning(f"WebSocket connection failed (attempt {consecutive_failures}), retrying in {delay}s")
                            await asyncio.sleep(delay)
                            continue

                    if self.websocket:
                        consecutive_failures = 0
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
        event_count = 0
        last_log_time = time.time()

        try:
            while self.is_running and self.websocket and not self._stop_event.is_set():
                try:
                    message = await asyncio.wait_for(self.websocket.recv(), timeout=30)
                    self.last_heartbeat = time.time()

                    rates = []
                    if isinstance(message, str):
                        self.message_buffer.append(message[:100])
                        rates = await self._parse_socketio_message(message)
                    elif isinstance(message, bytes):
                        try:
                            text = message.decode('utf-8')
                            rates = await self._parse_socketio_message(text)
                        except UnicodeDecodeError:
                            pass

                    if rates:
                        # Use callback (pub/sub) path instead of direct Redis storage
                        if callback:
                            await callback(self.config.competitor_name, rates)
                        event_count += len(rates)

                        current_time = time.time()
                        if current_time - last_log_time >= 10:
                            logger.info(f"Processed {event_count} rates for vasantbullion")
                            last_log_time = current_time
                            event_count = 0

                except asyncio.TimeoutError:
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

    async def _store_rates_in_redis(self, rates: List[RateData]):
        if not redis_manager.async_redis_client:
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

            for key in keys_to_track:
                await redis_manager.sadd("vasantbullion_active_keys", key)

            await redis_manager.set_json("vasantbullion:last_update", {
                'timestamp': current_time.isoformat(),
                'rate_count': len(rates)
            }, expire=3600)

        except Exception as e:
            logger.error(f"Error storing vasantbullion rates in Redis: {e}")
