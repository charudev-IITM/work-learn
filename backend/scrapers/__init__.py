from .vots.vots_scraper import VOTSScraper, VOTS_DEALERS
from .winbull.winbull_scraper import WinBullScraper, WINBULL_DEALERS
from .socketio.socketio_scraper import SocketIOScraper, SOCKETIO_DEALERS
from .csvbullion.csvbullion_scraper import CSVBullionScraper
from .rsbl.rsbl_scraper import RSBLScraper
from .vasantbullion.vasantbullion_scraper import VasantBullionScraper

# Build unified scraper registry: VOTS + WinBull + Socket.IO config-driven + custom scrapers
SCRAPERS = {name: lambda n=name, cfg=cfg: VOTSScraper(n, **cfg)
            for name, cfg in VOTS_DEALERS.items()}

SCRAPERS.update({name: lambda n=name, cfg=cfg: WinBullScraper(n, **cfg)
                 for name, cfg in WINBULL_DEALERS.items()})

SCRAPERS.update({name: lambda n=name, cfg=cfg: SocketIOScraper(n, **cfg)
                 for name, cfg in SOCKETIO_DEALERS.items()})

SCRAPERS['csvbullion'] = CSVBullionScraper
SCRAPERS['rsbl'] = RSBLScraper
SCRAPERS['vasantbullion'] = VasantBullionScraper


def get_scraper(competitor_name: str):
    """Get scraper instance by competitor name"""
    factory = SCRAPERS.get(competitor_name.lower())
    if factory is None:
        raise ValueError(f"No scraper found for competitor: {competitor_name}")
    # VOTS/WinBull entries are lambdas that return instances; class entries need ()
    return factory() if callable(factory) else factory


def get_all_scrapers():
    """Get all available scraper instances"""
    return [get_scraper(name) for name in SCRAPERS]
