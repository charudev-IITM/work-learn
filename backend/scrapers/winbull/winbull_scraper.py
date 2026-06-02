"""
Config-driven WinBull/LMX Trade API scraper.

All WinBull dealers share identical logic — only the name, API URL, origin,
and client ID differ. Adding a new WinBull dealer is a 3-line entry in
WINBULL_DEALERS below.
"""

from ..base.api_scraper import RecordTypedAPIScraper
from ..base.scraper import ScraperConfig, ScraperType
import logging

logger = logging.getLogger(__name__)

# ─── WinBull dealer registry ─────────────────────────────────────────────────
# Each entry needs: api_url, origin, client_id.

WINBULL_DEALERS = {
    "shivsahai": {
        "api_url": "http://13.200.166.91/lmxtrade/winbullliteapi/api/v1/broadcastrates",
        "origin": "http://www.shivsahai.com",
        "client_id": "ssahaitrd",
    },
    "vijaybullion": {
        "api_url": "http://www.vijaybullion.com/lmxtrade/winbullliteapi/api/v1/broadcastrates",
        "origin": "http://www.vijaybullion.com",
        "client_id": "vb",
    },
    "kjpl": {
        "api_url": "http://www.kjpl.in/lmxtrade/winbullliteapi/api/v1/broadcastrates",
        "origin": "http://www.kjpl.in",
        "client_id": "kjpl",
    },
    "priyankabullion": {
        "api_url": "http://13.126.240.225/lmxtrade/winbullliteapi/api/v1/broadcastrates",
        "origin": "http://priyankabullion.com",
        "client_id": "prtrd",
    },
    "kuberanbullion": {
        "api_url": "http://13.235.208.189/lmxtrade/winbullliteapi/api/v1/broadcastrates",
        "origin": "http://www.kuberanbullion.com",
        "client_id": "kb",
    },
    "jgrbullion": {
        "api_url": "http://www.jgrbullion.com/lmxtrade/winbullliteapi/api/v1/broadcastrates",
        "origin": "http://www.jgrbullion.com",
        "client_id": "jaiganesh",
    },
    "arhambullion": {
        "api_url": "http://13.200.107.222/lmxtrade/winbullliteapi/api/v1/broadcastrates",
        "origin": "http://www.arhambullion.com",
        "client_id": "arham",
    },
    "sdjbullion": {
        "api_url": "http://www.sdjbullion.com/lmxtrade/winbullliteapi/api/v1/broadcastrates",
        "origin": "http://www.sdjbullion.com",
        "client_id": "dhanapathi",
    },
    "ajorasbullion": {
        "api_url": "http://www.ajorasbullion.com/lmxtrade/winbullliteapi/api/v1/broadcastrates",
        "origin": "http://www.ajorasbullion.com",
        "client_id": "ajoras",
    },
    "baskarbullion": {
        "api_url": "http://3.108.128.67/lmxtrade/winbullliteapi/api/v1/broadcastrates",
        "origin": "http://www.baskarbullion.com",
        "client_id": "baskar",
    },
    "rnbullions": {
        "api_url": "http://www.rnbullions.com/lmxtrade/winbullliteapi/api/v1/broadcastrates",
        "origin": "http://www.rnbullions.com",
        "client_id": "rnbull",
    },
    "vardhinibullion": {
        "api_url": "http://www.vardhinibullion.com/lmxtrade/winbullliteapi/api/v1/broadcastrates",
        "origin": "http://www.vardhinibullion.com",
        "client_id": "vardhinibullion",
    },
    "ganeshbullion": {
        "api_url": "http://www.ganeshbullion.com/lmxtrade/winbullliteapi/api/v1/broadcastrates",
        "origin": "http://www.ganeshbullion.com",
        "client_id": "ganeshbullion",
    },
    "laxmijewellery": {
        "api_url": "http://3.108.128.67/lmxtrade/winbullliteapi/api/v1/broadcastrates",
        "origin": "http://www.laxmijewellery.in",
        "client_id": "lxj",
    },
}


def _build_winbull_headers(origin: str) -> dict:
    """Build standard WinBull request headers from origin."""
    return {
        'Accept': 'text/plain, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Content-Type': 'application/json',
        'Origin': origin,
        'Referer': f'{origin}/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    }


class WinBullScraper(RecordTypedAPIScraper):
    """Config-driven scraper for all WinBull/LMX Trade API dealers."""

    def __init__(self, name: str, api_url: str, origin: str, client_id: str, **overrides):
        config = ScraperConfig(
            competitor_name=name,
            base_url=api_url,
            scraper_type=ScraperType.API,
            poll_interval=overrides.get('poll_interval', 1),
            headers=_build_winbull_headers(origin),
        )
        super().__init__(config)
        self.client_id = client_id

    async def get_api_url(self) -> str:
        return self.config.base_url

    async def scrape_rates(self) -> list:
        """POST request with JSON payload containing client ID"""
        try:
            api_url = await self.get_api_url()
            post_data = {"client": self.client_id}

            async with self.session.post(
                api_url,
                json=post_data,
                headers=self.config.headers,
                ssl=False
            ) as response:
                if response.status == 200:
                    response_text = await response.text()
                    rates = self.parse_response_data(response_text)
                    logger.debug(f"Scraped {len(rates)} rates from {self.config.competitor_name}")
                    return rates
                else:
                    logger.warning(f"HTTP {response.status} for {api_url}")
                    return []

        except Exception as e:
            logger.error(f"Error scraping rates for {self.config.competitor_name}: {e}")
            return []
