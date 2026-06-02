"""
SONA AI Agent — Shared constants and utilities.

Used by agent_fast_path.py, agent_tools.py, and agent_guardrails.py.
No domain logic here — only primitives that multiple modules need.
"""

import re
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Timezone
# ---------------------------------------------------------------------------

IST = timezone(timedelta(hours=5, minutes=30))


# ---------------------------------------------------------------------------
# Indian-notation rate formatter
# ---------------------------------------------------------------------------

def format_rate(rate: Optional[float]) -> str:
    """Format a rate in Indian lakh notation (₹1,58,466 not ₹158,466).

    Returns '—' for zero/None/negative rates.
    """
    if not rate or rate <= 0:
        return '—'
    n = int(round(rate))
    if n < 1000:
        return f'₹{rate:,.2f}'
    # Indian grouping: last 3 digits, then groups of 2 from the right
    s = str(n)
    last3 = s[-3:]
    rest = s[:-3]
    groups = []
    while len(rest) > 2:
        groups.append(rest[-2:])
        rest = rest[:-2]
    if rest:
        groups.append(rest)
    groups.reverse()
    return '₹' + ','.join(groups) + ',' + last3


# ---------------------------------------------------------------------------
# IST timestamp helpers
# ---------------------------------------------------------------------------

def format_ist_now() -> str:
    """Current IST time as a display string, e.g. '10:32 AM IST'."""
    return datetime.now(IST).strftime('%I:%M %p IST')


def format_ist_from_utc(ts_str: Optional[str]) -> Optional[str]:
    """Convert a UTC ISO timestamp string to IST display string.

    Returns None if ts_str is None/invalid. Returns str(ts_str) as fallback
    when parsing fails so callers always get something displayable.
    """
    if not ts_str:
        return None
    try:
        dt = datetime.fromisoformat(str(ts_str))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(IST).strftime("%I:%M:%S %p IST")
    except (ValueError, TypeError):
        return str(ts_str)


# ---------------------------------------------------------------------------
# Dealer ID normalization
# ---------------------------------------------------------------------------

def normalize_dealer_id(name: str) -> str:
    """Strip all non-alphanumeric characters and lowercase a dealer name.

    Canonical normalization so 'KJ-Bullion', 'kjbullion', 'KJ Bullion'
    all collapse to 'kjbullion'.
    """
    return re.sub(r'[^a-z0-9]', '', name.lower())


# ---------------------------------------------------------------------------
# Dealer metadata loader
# ---------------------------------------------------------------------------

async def load_dealer_metadata() -> Dict[str, Dict]:
    """Load dealer metadata as a dict keyed by dealer_id.

    Reuses the /api/dealers/metadata endpoint's Redis cache (1h TTL).
    Returns {} on any error — callers degrade gracefully to raw dealer IDs.
    """
    try:
        from app.database.connection import redis_manager, shared_redis

        cached = await redis_manager.get_json("dealers:metadata")
        if cached and cached.get("dealers"):
            return {
                d["dealer_id"]: d
                for d in cached["dealers"]
                if d.get("dealer_id")
            }

        redis = shared_redis.async_redis_client
        if not redis:
            return {}
        dealer_ids = await redis.smembers("dealer:metadata:all")
        if not dealer_ids:
            return {}
        pipe = redis.pipeline()
        for did in dealer_ids:
            did_str = did.decode() if isinstance(did, bytes) else did
            pipe.hgetall(f"dealer:metadata:{did_str}")
        results = await pipe.execute()
        meta = {}
        for data in results:
            if not data:
                continue
            decoded = {
                (k.decode() if isinstance(k, bytes) else k): (v.decode() if isinstance(v, bytes) else v)
                for k, v in data.items()
            }
            did = decoded.get("dealer_id")
            if did:
                meta[did] = decoded
        return meta
    except Exception as e:
        logger.debug("Failed to load dealer metadata: %s", e)
        return {}


# ---------------------------------------------------------------------------
# Dealer display name formatter
# ---------------------------------------------------------------------------

def dealer_display(dealer_id: str, meta: Dict[str, Dict]) -> str:
    """Format a dealer for display: 'KJ Bullion (Mumbai)' or fallback to dealer_id."""
    info = meta.get(dealer_id, {})
    name = info.get("name") or dealer_id
    city = info.get("city")
    if city:
        return f"{name} ({city})"
    return name


# ---------------------------------------------------------------------------
# Entity-extraction keyword maps
# ---------------------------------------------------------------------------

COMMODITY_KEYWORDS: Dict[str, str] = {
    'gold': 'Gold', 'sona': 'Gold', 'swarn': 'Gold',
    'silver': 'Silver', 'chandi': 'Silver', 'chaandi': 'Silver',
    'platinum': 'Platinum', 'copper': 'Copper',
}

PURITY_KEYWORDS: Dict[str, str] = {
    '999': '999', '995': '995', '916': '916', '9999': '9999',
    '24k': '999', '24kt': '999', '22k': '916', '22kt': '916',
    '18k': '750', '18kt': '750',
    'fine': '999', 'pure': '999',
}

GST_KEYWORDS: Dict[str, str] = {
    'gst': 'incl-GST', 'with gst': 'incl-GST', 'incl gst': 'incl-GST',
    'without gst': 'ex-GST', 'ex gst': 'ex-GST', 'no gst': 'ex-GST',
}

# City name -> canonical form. Used for both entity extraction from user
# queries AND fuzzy city comparison. Includes historical names (Bombay,
# Madras, Calcutta, etc.) so user queries like "gold rate in Bombay" work.
CITY_ALIASES: Dict[str, str] = {
    'mumbai': 'Mumbai', 'bombay': 'Mumbai',
    'delhi': 'Delhi',
    'chennai': 'Chennai', 'madras': 'Chennai',
    'bangalore': 'Bangalore', 'bengaluru': 'Bangalore',
    'hyderabad': 'Hyderabad',
    'kolkata': 'Kolkata', 'calcutta': 'Kolkata',
    'ahmedabad': 'Ahmedabad',
    'jaipur': 'Jaipur',
    'pune': 'Pune', 'poona': 'Pune',
    'surat': 'Surat',
    'coimbatore': 'Coimbatore',
    'kochi': 'Kochi', 'cochin': 'Kochi',
    'lucknow': 'Lucknow',
    'rajkot': 'Rajkot',
    'indore': 'Indore',
    'varanasi': 'Varanasi', 'banaras': 'Varanasi', 'benares': 'Varanasi',
    'thiruvananthapuram': 'Thiruvananthapuram', 'trivandrum': 'Thiruvananthapuram',
    'vizag': 'Visakhapatnam', 'visakhapatnam': 'Visakhapatnam',
}


# ---------------------------------------------------------------------------
# City matching
# ---------------------------------------------------------------------------

def cities_match(city_a: str, city_b: str) -> bool:
    """Fuzzy city comparison — handles aliases like Bengaluru/Bangalore."""
    if not city_a or not city_b:
        return False
    if city_a.lower() == city_b.lower():
        return True
    norm_a = CITY_ALIASES.get(city_a.lower(), city_a)
    norm_b = CITY_ALIASES.get(city_b.lower(), city_b)
    return norm_a.lower() == norm_b.lower()


# ---------------------------------------------------------------------------
# Standard weight for a commodity
# ---------------------------------------------------------------------------

def standard_weight(commodity: Optional[str]) -> Optional[str]:
    """Return the standard trading weight for a commodity, or None if unknown.

    Gold/Platinum trade per 10g, Silver per 1kg in Indian markets.
    """
    if commodity in ('Gold', 'Platinum'):
        return '10g'
    elif commodity == 'Silver':
        return '1kg'
    return None


# ---------------------------------------------------------------------------
# Taxonomy item filter
# ---------------------------------------------------------------------------

def filter_dealer_rates(
    items: List[Dict],
    commodity: Optional[str] = None,
    purity: Optional[str] = None,
    city: Optional[str] = None,
    gst: Optional[str] = None,
    dealer_city: Optional[str] = None,
    std_weight: Optional[str] = None,
) -> List[Dict]:
    """Filter classified taxonomy items by standard criteria.

    Used by both the fast path and LLM tools to avoid duplicating filter logic.

    City matching uses UNION logic:
      - Script explicitly mentions the requested city -> include
      - Dealer is from that city (metadata) AND script has no city -> include
      - Script explicitly mentions a DIFFERENT city -> exclude
    """
    filtered = []
    for item in items:
        c = item['classification']
        if c.get('rate_category') != 'dealer_rate':
            continue
        if commodity and c.get('commodity') != commodity:
            continue
        if purity and c.get('purity') != purity:
            continue
        if std_weight:
            w = c.get('weight')
            if w is not None and w != std_weight:
                continue
        if city:
            script_city = c.get('city')
            if script_city:
                if not cities_match(script_city, city):
                    continue
            else:
                if not dealer_city or not cities_match(dealer_city, city):
                    continue
        if gst and c.get('gst') != gst:
            continue
        buy = item.get('buy_rate') or 0
        sell = item.get('sell_rate') or 0
        if buy <= 0 and sell <= 0:
            continue
        filtered.append(item)
    return filtered
