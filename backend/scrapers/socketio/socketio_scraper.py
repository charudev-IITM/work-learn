"""
Config-driven Socket.IO WebSocket scraper.

All Socket.IO dealers share identical logic — only the server URL,
client registration name, and origin differ. Adding a new Socket.IO
dealer is a 3-line entry in SOCKETIO_DEALERS below.
"""

import asyncio
import ssl
import websockets
import json
import gzip
import zlib
import re
import time
import logging
from typing import List, Optional
from datetime import datetime
from collections import deque
from ..base.scraper import BaseScraper, RateData, ScraperConfig, ScraperType
from app.database.connection import redis_manager

logger = logging.getLogger(__name__)

MAX_RECONNECT_ATTEMPTS = 5
BASE_RETRY_DELAY = 1.0
MAX_RETRY_DELAY = 60.0

# ─── Socket.IO dealer registry ──────────────────────────────────────────────
# Each entry needs: server_url, client_name, origin.
# server_url: The Socket.IO server base (e.g. https://domain:10001)
# client_name: The prjName sent via emit('client', name)
# origin: The dealer website origin for headers

SOCKETIO_DEALERS = {
    "ambicaaspot": {
        "server_url": "http://dashboard.ambicaaspot.com:10001",
        "client_name": "ambicaaspot",
        "origin": "http://ambicaaspot.com",
    },
    "nakodabullion": {
        "server_url": "https://starlinetechno.in:10001",
        "client_name": "nakodabullion",
        "origin": "http://nakodabullion.com",
    },
    "lawatjewellers": {
        "server_url": "https://starlinesupport.co.in:10001",
        "client_name": "lawatjewellers",
        "origin": "http://www.lawatjewellers.com",
    },
    "vickygold": {
        "server_url": "https://vickygold.co.in:10001",
        "client_name": "vickygold",
        "origin": "https://www.vickygold.in",
    },
    "sohanbullion": {
        "server_url": "https://starlinebuild.in:10001",
        "client_name": "sohanbullion",
        "origin": "http://sohanbullion.com",
    },
    "bullionnerve": {
        "server_url": "https://www.bullionnerve.com:10000",
        "client_name": "4sbullion",
        "origin": "https://www.bullionnerve.com",
    },
    "pritamspot": {
        "server_url": "https://starlinebuild.co.in:10001",
        "client_name": "pritam",
        "origin": "http://www.pritamspot.com",
    },
    "jrbullionllp": {
        "server_url": "https://starlinebulltech.in:10001",
        "client_name": "jrjewellers",
        "origin": "https://jrbullionllp.in",
    },
    "mudrabullion": {
        "server_url": "https://starlineadmin.co.in:10001",
        "client_name": "mudra",
        "origin": "http://mudrabullion.in",
    },
    "smbullion": {
        "server_url": "https://smbullion.in:10001",
        "client_name": "osiyabullion",
        "origin": "https://smbullion.in",
    },
    "arihantbullions": {
        "server_url": "https://sladmin.in:10001",
        "client_name": "arihantbullion",
        "origin": "http://arihantbullions.in",
    },
    "tirupatibullion": {
        "server_url": "https://tirupatibullion.in:10001",
        "client_name": "tirupati",
        "origin": "https://tirupatibullion.in",
    },
    "mahasiddhibullion": {
        "server_url": "https://t5.starlinedashboard.in:10001",
        "client_name": "mahasiddhi",
        "origin": "http://mahasiddhibullion.com",
    },
    "mehtabullion": {
        "server_url": "https://starlinesolutions.in:10001",
        "client_name": "mehtabullion",
        "origin": "http://mehtabullion.in",
    },
    "vimalabullion": {
        "server_url": "https://vimalabullion.com:10001",
        "client_name": "vimalabullion",
        "origin": "http://vimalabullion.com",
    },
    "jaybullion": {
        "server_url": "https://starlineadmin.co.in:10001",
        "client_name": "jaybullion",
        "origin": "http://jaybullion.in",
    },
    "mahavirbullion": {
        "server_url": "https://sladmin.in:10001",
        "client_name": "mahavir",
        "origin": "http://mahavirbullion.com",
    },
    "rsbullion": {
        "server_url": "https://b1.starlinedashboard.in:10001",
        "client_name": "rsbullion",
        "origin": "http://rsbullion.in",
    },
    "sbbullion": {
        "server_url": "https://starlinedashboard.in:10001",
        "client_name": "sbbullion",
        "origin": "http://sbbullion.in",
    },
    "bhagyashreegold": {
        "server_url": "https://starlinetech.in:10001",
        "client_name": "bhagyashreegold",
        "origin": "http://bhagyashreegold.in",
    },
    "bombaybullion": {
        "server_url": "https://sladmin.co.in:10001",
        "client_name": "bombaybullion",
        "origin": "http://bombaybullion.in",
    },
    "ashapuragold": {
        "server_url": "https://starlinebulltech.in:10001",
        "client_name": "ashapuragold",
        "origin": "http://ashapuragold.in",
    },
    "mdtraders": {
        "server_url": "https://starlinebulltech.in:10001",
        "client_name": "mdtraders",
        "origin": "http://mdtraders.in",
    },
    "nsventerprise": {
        "server_url": "https://starlinetech.in:10001",
        "client_name": "nsventerprise",
        "origin": "http://nsventerprise.in",
    },
    "shreesomnathmetals": {
        "server_url": "https://starlinebuild.co.in:10001",
        "client_name": "somnathmetals",
        "origin": "http://shreesomnathmetals.in",
    },
}


class SocketIOScraper(BaseScraper):
    """Config-driven scraper for all Socket.IO WebSocket dealers."""

    def __init__(self, name: str, server_url: str, client_name: str, origin: str, **overrides):
        config = ScraperConfig(
            competitor_name=name,
            base_url=server_url,
            scraper_type=ScraperType.WEBSOCKET,
            poll_interval=1,
            headers={
                'Origin': origin,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            },
        )
        super().__init__(config)

        self.server_url = server_url.rstrip("/")
        self.client_name = client_name

        # Derive WebSocket scheme from server URL
        if self.server_url.startswith("https"):
            self.ws_scheme = "wss"
            self.http_scheme = "https"
        else:
            self.ws_scheme = "ws"
            self.http_scheme = "http"

        # Build URLs from server base
        host_port = self.server_url.split("://", 1)[1]
        self.websocket_url = f"{self.ws_scheme}://{host_port}/socket.io/"
        self.handshake_url = f"{self.server_url}/socket.io/?EIO=4&transport=polling"

        # Connection state
        self.websocket: Optional[websockets.WebSocketServerProtocol] = None
        self.session_id: Optional[str] = None
        self.reconnect_attempts = 0
        self.last_reconnect = 0
        self._has_connected = False
        self.last_heartbeat = time.time()
        self._compression_method = None
        self._original_scraper_type = ScraperType.WEBSOCKET

        # Redis
        self.redis_key_prefix = f"{name}_rate:"

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
            if not self.session:
                return False
            async with self.session.get(
                self.handshake_url, headers=self.config.headers, ssl=False
            ) as response:
                if response.status == 200:
                    data = await response.text()
                    if data.startswith("0{"):
                        json_data = json.loads(data[1:])
                        self.session_id = json_data.get("sid")
                        logger.info(f"Got session ID for {self.config.competitor_name}")
                        return True
            return False
        except Exception as e:
            logger.error(f"Handshake failed for {self.config.competitor_name}: {e}")
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
                self.reconnect_attempts = 0
                return False

            if not await self._get_session_id():
                raise Exception("Failed to get session ID")

            ws_url = f"{self.websocket_url}?EIO=4&transport=websocket&sid={self.session_id}"

            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE

            self.websocket = await websockets.connect(
                ws_url,
                extra_headers=self.config.headers,
                ping_interval=20,
                ping_timeout=10,
                ssl=ssl_ctx if self.ws_scheme == "wss" else None,
            )

            # Socket.IO upgrade sequence
            await self.websocket.send("2probe")
            response = await asyncio.wait_for(self.websocket.recv(), timeout=10)

            if response == "3probe":
                await self.websocket.send("5")
                await self.websocket.send("40")
                await asyncio.sleep(0.3)
                await self.websocket.send(f'42["client","{self.client_name}"]')

                self.reconnect_attempts = 0
                self.last_heartbeat = current_time

                if not self._has_connected:
                    logger.info(f"Connected to Socket.IO for {self.config.competitor_name}")
                    self._has_connected = True
                return True
            else:
                raise Exception(f"Unexpected upgrade response: {response}")
        except Exception as e:
            if self.reconnect_attempts <= 2:
                logger.warning(
                    f"Socket.IO connect failed for {self.config.competitor_name} "
                    f"(attempt {self.reconnect_attempts}): {e}"
                )
            return False

    async def scrape_rates(self) -> List[RateData]:
        return []

    async def get_available_scripts(self):
        return []

    async def run_continuous(self, callback=None):
        if self.config.scraper_type == ScraperType.WEBSOCKET:
            logger.info(f"Starting Socket.IO scraping for {self.config.competitor_name}")
            consecutive_failures = 0

            while self.is_running and not self._stop_event.is_set():
                try:
                    if not self.websocket:
                        connected = await self._connect_socketio()
                        if not connected:
                            consecutive_failures += 1
                            delay = min(10 * (2 ** (consecutive_failures - 1)), 120)
                            await asyncio.sleep(delay)
                            continue

                    if self.websocket:
                        consecutive_failures = 0
                        await self._listen_for_events(callback)
                except Exception as e:
                    logger.error(f"Error in {self.config.competitor_name} event loop: {e}")
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
        name = self.config.competitor_name

        try:
            while self.is_running and self.websocket and not self._stop_event.is_set():
                try:
                    message = await asyncio.wait_for(self.websocket.recv(), timeout=30)
                    self.last_heartbeat = time.time()

                    rates = []
                    if isinstance(message, str):
                        rates = await self._parse_socketio_message(message)
                    elif isinstance(message, bytes):
                        try:
                            rates = await self._parse_socketio_message(message.decode("utf-8"))
                        except UnicodeDecodeError:
                            pass

                    if rates:
                        # Use callback (pub/sub) path instead of direct Redis storage
                        if callback:
                            await callback(name, rates)
                        event_count += len(rates)

                        current_time = time.time()
                        if current_time - last_log_time >= 30:
                            logger.info(f"Processed {event_count} rates for {name}")
                            last_log_time = current_time
                            event_count = 0

                except asyncio.TimeoutError:
                    if time.time() - self.last_heartbeat > 60:
                        logger.warning(f"No heartbeat for {name}, reconnecting")
                        break
                    continue

        except websockets.exceptions.ConnectionClosed as e:
            logger.warning(f"Socket.IO closed for {name}: {e}")
            self.websocket = None
            self.session_id = None
            raise
        except Exception as e:
            logger.error(f"Error in {name} listener: {e}")
            self.websocket = None
            self.session_id = None
            raise

    async def _parse_socketio_message(self, message: str) -> List[RateData]:
        rates = []
        try:
            if message.startswith("2"):
                await self._send_pong()
                return []
            elif message.startswith("40") or message.startswith("41"):
                return []

            # Events parsed as refProduct format (Bid/Ask/High/Low keys)
            REF_EVENTS = {"refProduct", "Liverate", "refDetails", "referanceProducts", "referanceDetails", "LiveData"}
            # Events parsed as mainProduct format (bid/ask/high/low keys)
            MAIN_EVENTS = {"mainProduct", "mainProducts", "clientDetails", "coinDetails", "contactDetails"}
            ALL_EVENTS = REF_EVENTS | MAIN_EVENTS

            if message.startswith("45"):
                if "-" in message:
                    parts = message.split("-", 1)
                    if len(parts) == 2:
                        json_data = parts[1]
                        if json_data.startswith("["):
                            data = json.loads(json_data)
                            if isinstance(data, list) and len(data) >= 2:
                                event_name = data[0]
                                if event_name in ALL_EVENTS:
                                    try:
                                        binary_data = await asyncio.wait_for(
                                            self.websocket.recv(), timeout=10
                                        )
                                        if isinstance(binary_data, bytes):
                                            etype = "mainProduct" if event_name in MAIN_EVENTS else "refProduct"
                                            rates = await self._parse_binary_attachment(
                                                binary_data, etype
                                            )
                                            if rates:
                                                return rates
                                    except asyncio.TimeoutError:
                                        pass

            elif message.startswith("42"):
                json_data = message[2:]
                if json_data.startswith("["):
                    data = json.loads(json_data)
                    if isinstance(data, list) and len(data) >= 2:
                        event_name = data[0]
                        event_data = data[1]

                        if event_name in MAIN_EVENTS:
                            rates = await self._parse_main_product_data(event_data)
                        elif event_name in REF_EVENTS:
                            rates = await self._parse_ref_product_data(event_data)
                        return rates

        except Exception as e:
            logger.error(f"Error parsing message for {self.config.competitor_name}: {e}")
        return rates

    async def _parse_binary_attachment(self, binary_data: bytes, event_type: str) -> List[RateData]:
        try:
            data = None
            try:
                data = json.loads(binary_data.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                decompressed = self._pako_inflate(binary_data)
                if decompressed:
                    try:
                        data = json.loads(decompressed.decode("utf-8"))
                    except (UnicodeDecodeError, json.JSONDecodeError):
                        return []
                else:
                    return []

            if event_type == "mainProduct" and data:
                return await self._parse_main_product_data(data)
            elif event_type == "refProduct" and data:
                return await self._parse_ref_product_data(data)
        except Exception as e:
            logger.error(f"Error parsing binary for {self.config.competitor_name}: {e}")
        return []

    def _pako_inflate(self, data: bytes) -> Optional[bytes]:
        if self._compression_method:
            try:
                if self._compression_method == "raw_deflate":
                    return zlib.decompress(data, -zlib.MAX_WBITS)
                elif self._compression_method == "zlib":
                    return zlib.decompress(data)
                elif self._compression_method == "gzip":
                    return gzip.decompress(data)
                elif isinstance(self._compression_method, int):
                    return zlib.decompress(data, self._compression_method)
            except (zlib.error, gzip.BadGzipFile, OSError):
                self._compression_method = None

        methods = [
            ("raw_deflate", lambda: zlib.decompress(data, -zlib.MAX_WBITS)),
            ("zlib", lambda: zlib.decompress(data)),
            ("gzip", lambda: gzip.decompress(data)),
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

    async def _parse_main_product_data(self, data) -> List[RateData]:
        rates = []
        try:
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict):
                    rate = self._create_main_product_rate(item)
                    if rate:
                        rates.append(rate)
        except Exception as e:
            logger.error(f"Error parsing mainProduct for {self.config.competitor_name}: {e}")
        return rates

    async def _parse_ref_product_data(self, data) -> List[RateData]:
        rates = []
        try:
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict):
                    rate = self._create_ref_product_rate(item)
                    if rate:
                        rates.append(rate)
        except Exception as e:
            logger.error(f"Error parsing refProduct for {self.config.competitor_name}: {e}")
        return rates

    def _create_main_product_rate(self, data: dict) -> Optional[RateData]:
        try:
            script_name = data.get("name", data.get("Name", "Unknown"))
            bid_rate = self._parse_rate(data.get("bid"))
            ask_rate = self._parse_rate(data.get("ask"))
            high_rate = self._parse_rate(data.get("high"))
            low_rate = self._parse_rate(data.get("low"))

            is_display = data.get("iv", data.get("isView", True))
            if not is_display:
                return None

            if not (bid_rate or ask_rate):
                return None

            return RateData(
                script_name=script_name,
                symbol=script_name.upper().replace(" ", "_"),
                buy_rate=bid_rate,
                sell_rate=ask_rate,
                high_rate=high_rate,
                low_rate=low_rate,
            )
        except Exception:
            return None

    def _create_ref_product_rate(self, data: dict) -> Optional[RateData]:
        try:
            script_name = data.get("Name", data.get("symbol", "Unknown"))
            symbol = data.get("symbol", script_name).upper()
            bid_rate = self._parse_rate(data.get("Bid"))
            ask_rate = self._parse_rate(data.get("Ask"))
            high_rate = self._parse_rate(data.get("High"))
            low_rate = self._parse_rate(data.get("Low"))

            if bid_rate or ask_rate:
                return RateData(
                    script_name=script_name,
                    symbol=symbol,
                    buy_rate=bid_rate,
                    sell_rate=ask_rate,
                    high_rate=high_rate,
                    low_rate=low_rate,
                )
            return None
        except Exception:
            return None

    async def _send_pong(self):
        try:
            if self.websocket:
                await self.websocket.send("3")
        except Exception:
            pass

    async def _store_rates_in_redis(self, rates: List[RateData]):
        if not redis_manager.async_redis_client:
            return
        try:
            current_time = datetime.utcnow()
            name = self.config.competitor_name
            keys_to_track = []

            for rate in rates:
                rate_data = {
                    "script_name": rate.script_name,
                    "symbol": rate.symbol,
                    "buy_rate": rate.buy_rate,
                    "sell_rate": rate.sell_rate,
                    "high_rate": rate.high_rate,
                    "low_rate": rate.low_rate,
                    "timestamp": current_time.isoformat(),
                    "volume": rate.volume,
                }
                redis_key = f"{self.redis_key_prefix}{rate.symbol}"
                await redis_manager.set_json(redis_key, rate_data, expire=3600)
                keys_to_track.append(redis_key)

            # SADD one key at a time (production redis_manager constraint)
            active_keys_set = f"{name}_active_keys"
            for key in keys_to_track:
                await redis_manager.sadd(active_keys_set, key)

            await redis_manager.set_json(
                f"{name}:last_update",
                {"timestamp": current_time.isoformat(), "rate_count": len(rates)},
                expire=3600,
            )
        except Exception as e:
            logger.error(f"Error storing rates in Redis for {self.config.competitor_name}: {e}")
