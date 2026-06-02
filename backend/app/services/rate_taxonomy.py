"""
Rate Line Item Taxonomy — Classifies freeform dealer script names into structured metadata.

Each dealer publishes rates with freeform `script_name` strings like "GOLD 999",
"Gold 100Gms 999 (Chennai)(T+0)", "CHANDI", "Silver Bar", or even numeric WinBull IDs.
This module parses those strings (plus rate magnitudes) into a structured RateClassification:

    commodity, purity, weight, gst, delivery, city, market_type, form, rate_category

The classifier handles five naming conventions:
  1. VOTS/SocketIO  — human-readable ("GOLD 999", "GOLD RTGS 16 march")
  2. WinBull        — numeric instrument IDs (116433415), classified by rate magnitude
  3. RSBL           — coded ("GOLDMUM1KG995", "SILCHN20KG", "COIN999G5")
  4. Reference      — international prices (XAUUSD, INR, GOLD AM FIX)
  5. Special        — premiums, spreads, placeholders (DIFF, CALL FOR RATES)
"""

import json as _json
import re
import logging
from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, List

logger = logging.getLogger(__name__)


# ── Data class ────────────────────────────────────────────────────────────────

@dataclass
class RateClassification:
    """Structured metadata extracted from a script name + rate values."""
    commodity: str = "Unknown"          # Gold, Silver, Platinum, Copper, XAUUSD, XAGUSD, USD/INR, XPTUSD
    purity: Optional[str] = None        # 999, 995, 916, 750, 9999
    weight: Optional[str] = None        # 1g, 10g, 100g, 1kg, 1tola, 1oz, etc.
    weight_grams: Optional[float] = None  # Normalized weight in grams (None if unknown)
    gst: Optional[str] = None           # incl-GST, ex-GST, or None (unknown)
    delivery: Optional[str] = None      # Spot, T+1, T+2, Futures(Mon-YY), MCX_Ref
    city: Optional[str] = None          # Mumbai, Chennai, Delhi, etc.
    state: Optional[str] = None         # Maharashtra, Tamil Nadu, etc. (from RSBL/GST variants)
    market_type: str = "Spot"           # Spot, Futures, MCX, COMEX, Forex
    form: Optional[str] = None          # Coin, Bar, Biscuit, Tola_Bar, Petal, Chorsa, Peti
    min_qty: Optional[str] = None       # Minimum order qty tier: "100g-1kg", "5g-25g", etc.
    rate_category: str = "dealer_rate"  # dealer_rate, reference, premium, spread, placeholder
    notes: Optional[str] = None         # Any extra context

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}

    @property
    def canonical_type(self) -> str:
        """Generate a canonical type string for cross-dealer comparison.
        e.g. Gold_999_10g, Silver_999_1kg, Gold_995_100g_Coin
        """
        parts = [self.commodity]
        if self.purity:
            parts.append(self.purity)
        if self.weight:
            parts.append(self.weight)
        if self.form:
            parts.append(self.form)
        return "_".join(parts)


# ── City patterns ─────────────────────────────────────────────────────────────

# (regex_pattern, city_name, optional_state)
CITY_PATTERNS = [
    (r'\b(?:chennai|chn|madras)\b', 'Chennai', 'Tamil Nadu'),
    (r'\b(?:mumbai|bombay|mum)\b', 'Mumbai', 'Maharashtra'),
    (r'\b(?:delhi|dli|ncr|del)\b', 'Delhi', 'Delhi'),
    (r'\b(?:ahmedabad|ahd|amd)\b', 'Ahmedabad', 'Gujarat'),
    (r'\b(?:hyderabad|hyd)\b', 'Hyderabad', 'Telangana'),
    (r'\b(?:kolkata|calcutta|kol)\b', 'Kolkata', 'West Bengal'),
    (r'\b(?:bangalore|bengaluru|blr)\b', 'Bangalore', 'Karnataka'),
    (r'\b(?:jaipur|jpr|jai)\b', 'Jaipur', 'Rajasthan'),
    (r'\b(?:rajkot)\b', 'Rajkot', 'Gujarat'),
    (r'\b(?:coimbatore|cbe|cbt|cmb)\b', 'Coimbatore', 'Tamil Nadu'),
    (r'\b(?:salem|slm)\b', 'Salem', 'Tamil Nadu'),
    (r'\b(?:trichy|tiruchirapalli|tcy)\b', 'Trichy', 'Tamil Nadu'),
    (r'\b(?:tirunelveli|nellai)\b', 'Tirunelveli', 'Tamil Nadu'),
    (r'\b(?:madurai|mdr)\b', 'Madurai', 'Tamil Nadu'),
    (r'\b(?:erode)\b', 'Erode', 'Tamil Nadu'),
    (r'\b(?:cochin|kochi|koc)\b', 'Kochi', 'Kerala'),
    (r'\b(?:surat|srt)\b', 'Surat', 'Gujarat'),
    (r'\b(?:pune|pun)\b', 'Pune', 'Maharashtra'),
    (r'\b(?:indore|idr|ird)\b', 'Indore', 'Madhya Pradesh'),
    (r'\b(?:lucknow|lko)\b', 'Lucknow', 'Uttar Pradesh'),
    (r'\b(?:vizag|visakhapatnam|vjy)\b', 'Visakhapatnam', 'Andhra Pradesh'),
    (r'\b(?:kanpur|knp)\b', 'Kanpur', 'Uttar Pradesh'),
    (r'\b(?:nagpur)\b', 'Nagpur', 'Maharashtra'),
    (r'\b(?:bhopal)\b', 'Bhopal', 'Madhya Pradesh'),
    (r'\b(?:agra|agr)\b', 'Agra', 'Uttar Pradesh'),
    (r'\b(?:panvel|pnv)\b', 'Panvel', 'Maharashtra'),
]

# State patterns (extracted from GST/Without GST labels and RSBL state codes)
STATE_PATTERNS = [
    (r'\b(?:maharashtra)\b', 'Maharashtra'),
    (r'\b(?:tamil\s*nadu)\b', 'Tamil Nadu'),
    (r'\b(?:karnataka)\b', 'Karnataka'),
    (r'\b(?:gujarat)\b', 'Gujarat'),
    (r'\b(?:telangana)\b', 'Telangana'),
    (r'\b(?:andhra\s*pradesh)\b', 'Andhra Pradesh'),
    (r'\b(?:uttar\s*pradesh)\b', 'Uttar Pradesh'),
    (r'\b(?:rajasthan)\b', 'Rajasthan'),
    (r'\b(?:kerala)\b', 'Kerala'),
    (r'\b(?:west\s*bengal)\b', 'West Bengal'),
    (r'\b(?:madhya\s*pradesh|madhyapradesh)\b', 'Madhya Pradesh'),
]

# RSBL 3-letter city codes (used in coded names like GOLDMUM995, SILCHN20KG)
RSBL_CITY_CODES = {
    'MUM': ('Mumbai', 'Maharashtra'),
    'DEL': ('Delhi', 'Delhi'),
    'CHN': ('Chennai', 'Tamil Nadu'),
    'BLR': ('Bangalore', 'Karnataka'),
    'HYD': ('Hyderabad', 'Telangana'),
    'KOL': ('Kolkata', 'West Bengal'),
    'AHD': ('Ahmedabad', 'Gujarat'),
    'SRT': ('Surat', 'Gujarat'),
    'AGR': ('Agra', 'Uttar Pradesh'),
    'KNP': ('Kanpur', 'Uttar Pradesh'),
    'LKO': ('Lucknow', 'Uttar Pradesh'),
    'VJY': ('Visakhapatnam', 'Andhra Pradesh'),
    'JAI': ('Jaipur', 'Rajasthan'),
    'PUN': ('Pune', 'Maharashtra'),
    'CMB': ('Coimbatore', 'Tamil Nadu'),
    'CBT': ('Coimbatore', 'Tamil Nadu'),
    'MDR': ('Madurai', 'Tamil Nadu'),
    'SLM': ('Salem', 'Tamil Nadu'),
    'TCY': ('Trichy', 'Tamil Nadu'),
    'IDR': ('Indore', 'Madhya Pradesh'),
    'IRD': ('Indore', 'Madhya Pradesh'),
    'KOC': ('Kochi', 'Kerala'),
    'KOP': ('Kolhapur', 'Maharashtra'),
    'PNV': ('Panvel', 'Maharashtra'),
    'IND': ('India', None),  # Generic India-wide rate
    'UK': ('Uttarakhand', 'Uttarakhand'),
}

# Compiled city regex patterns (compiled once at module load)
_CITY_RE = [(re.compile(p, re.I), city, state) for p, city, state in CITY_PATTERNS]
_STATE_RE = [(re.compile(p, re.I), state) for p, state in STATE_PATTERNS]


# ── Weight parsing ────────────────────────────────────────────────────────────

# Weight unit to grams conversion
WEIGHT_GRAMS = {
    'g': 1.0, 'gm': 1.0, 'gms': 1.0, 'gram': 1.0, 'grams': 1.0,
    'kg': 1000.0, 'kgs': 1000.0,
    'tola': 11.6638, 'petal': 8.0, 'guinea': 8.0,
    'oz': 31.1035, 'ounce': 31.1035,
}


def _is_volume_tier(name: str) -> bool:
    """Check if the name contains a volume-tier range like '100GM TO 1KG RATE'.

    These are NOT weight indicators — they specify the order quantity range
    for which this per-unit rate applies. The actual pricing unit must be
    inferred from rate magnitude.
    """
    lower = name.lower()
    # "100gm to 1kg", "5gm to 25gm", "50g to 100g"
    if re.search(r'\d+\s*(?:gm|gms|g|kg)\s+to\s+\d+\s*(?:gm|gms|g|kg)', lower):
        return True
    # "below 50 gm", "above 500gms"
    if re.search(r'\b(?:below|above|upto|up\s+to|under|over)\s+\d+\s*(?:gm|gms|g|kg)', lower):
        return True
    # "(500gms and above)", "(100-400gms)", "(1-4 kg)", "(1-29 kgs)"
    if re.search(r'\d+\s*(?:gm|gms|g|kg|kgs)\s+(?:and|&)\s+(?:above|below)', lower):
        return True
    if re.search(r'\(\d+-\d+\s*(?:gm|gms|g|kg|kgs)\)', lower):
        return True
    if re.search(r'\b\d+-\d+\s*(?:kg|kgs)\b', lower):
        return True
    # "20-45 gm" (range without parens)
    if re.search(r'\b\d+-\d+\s*(?:gm|gms|g)\b', lower):
        return True
    return False


def _extract_volume_tier(name: str) -> Optional[str]:
    """Extract the volume tier range string from a script name.

    Returns e.g. "100g-1kg", "5g-25g", "below 50g", or None.
    """
    lower = name.lower()

    # "100gm to 1kg" → "100g-1kg"
    m = re.search(r'(\d+)\s*(?:gm|gms|g|gram|grams)\s+to\s+(\d+)\s*(gm|gms|g|gram|grams|kg|kgs)', lower)
    if m:
        lo = m.group(1)
        hi = m.group(2)
        hi_unit = 'kg' if m.group(3).startswith('kg') else 'g'
        return f"{lo}g-{hi}{hi_unit}"

    # "below 50 gm", "above 500gms" → "below 50g"
    m = re.search(r'(below|above|upto|up\s+to|under|over)\s+(\d+)\s*(?:gm|gms|g|gram|grams|kg|kgs)', lower)
    if m:
        qualifier = m.group(1).replace(' ', '')
        val = m.group(2)
        return f"{qualifier} {val}g"

    # "(500gms and above)", "(45 gms and below)"
    m = re.search(r'(\d+)\s*(?:gm|gms|g|gram|grams)\s+(?:and|&)\s+(above|below)', lower)
    if m:
        val = m.group(1)
        qualifier = m.group(2)
        return f"{qualifier} {val}g" if qualifier == 'below' else f"{val}g+"

    # "(100-400gms)", "(1-4 kg)", "1-29 kgs", "20-45 gm"
    m = re.search(r'(\d+)-(\d+)\s*(gm|gms|g|gram|grams|kg|kgs)', lower)
    if m:
        lo = m.group(1)
        hi = m.group(2)
        unit = 'kg' if m.group(3).startswith('kg') else 'g'
        return f"{lo}{unit}-{hi}{unit}"

    return None


def _parse_weight(name: str, skip_volume_tier: bool = False) -> tuple:
    """Extract weight from script name. Returns (weight_str, weight_grams) or (None, None).

    If skip_volume_tier is True, skips extraction (caller already detected a volume tier).
    """
    if skip_volume_tier:
        return None, None

    lower = name.lower()

    # "per kg"
    if re.search(r'\bper\s*kg\b', lower):
        return '1kg', 1000.0

    # Nkg
    m = re.search(r'\b(\d+)\s*(?:kg|kgs)\b', lower)
    if m:
        n = int(m.group(1))
        return f'{n}kg', n * 1000.0

    # N grams (check from the string)
    m = re.search(r'\b(\d+(?:\.\d+)?)\s*(?:gm|gms|gram|grams|g)\b', lower)
    if m:
        n = float(m.group(1))
        label = f'{int(n)}g' if n == int(n) else f'{n}g'
        return label, n

    # Tola
    if re.search(r'\btola\b', lower):
        return '1tola', 11.6638

    # Petal / Guinea
    if re.search(r'\b(?:petal|guinea)\b', lower):
        return '1petal', 8.0

    # Ounce
    if re.search(r'\b(?:1\s*)?(?:ounce|oz)\b', lower):
        return '1oz', 31.1035

    return None, None


def _compute_median_rates(all_results: Dict[str, List[Dict]]) -> Dict[str, float]:
    """Compute median dealer rates per commodity from already-classified data.

    Uses Phase 1 classification results instead of re-parsing raw script names.
    Only considers dealer_rate items (not reference/premium/placeholder).
    """
    from collections import defaultdict

    commodity_rates: Dict[str, List[float]] = defaultdict(list)

    for dealer_id, items in all_results.items():
        for item in items:
            c = item.get('classification', {})
            if isinstance(c, dict):
                cat = c.get('rate_category', 'dealer_rate')
                commodity = c.get('commodity')
            else:
                cat = getattr(c, 'rate_category', 'dealer_rate')
                commodity = getattr(c, 'commodity', None)

            if cat != 'dealer_rate' or not commodity:
                continue
            rate = item.get('buy_rate') or item.get('sell_rate') or 0
            if rate > 0:
                commodity_rates[commodity].append(rate)

    medians = {}
    for commodity, rates in commodity_rates.items():
        if rates:
            sorted_rates = sorted(rates)
            medians[commodity] = sorted_rates[len(sorted_rates) // 2]
    return medians


def _rate_matches_weight(rate: float, weight_grams: float, median_rate: float, median_unit_grams: float) -> bool:
    """Check if a rate is consistent with the given weight, using the median as reference.

    Example: median Gold rate is ₹158,000 (per 10g = median_unit_grams=10).
    If a script says "1KG" (weight_grams=1000) at ₹156,000, the expected rate
    for 1KG would be ₹158,000 * (1000/10) = ₹15,800,000. The actual rate
    ₹156,000 is 1% of expected → mismatch → "1KG" is a lot size, not pricing unit.
    """
    if not median_rate or not median_unit_grams or not weight_grams or rate <= 0:
        return True  # Can't validate, assume match

    expected = median_rate * (weight_grams / median_unit_grams)
    if expected <= 0:
        return True

    ratio = rate / expected
    # Allow 40-250% of expected (generous range for dealer price variation)
    return 0.4 <= ratio <= 2.5


# ── Core classifier ───────────────────────────────────────────────────────────

def classify_rate(
    script_name: str,
    buy_rate: Optional[float] = None,
    sell_rate: Optional[float] = None,
    dealer_id: Optional[str] = None,
) -> RateClassification:
    """Classify a single rate line item into structured taxonomy."""
    c = RateClassification()
    original = script_name
    lower = script_name.lower().strip()
    rate = buy_rate or sell_rate or 0

    # ── Special cases first ───────────────────────────────────────────

    # Placeholder / separator
    if lower in ('-', '', 'call for rates', 'dont delete', 'na', 'n/a'):
        c.commodity = 'Placeholder'
        c.rate_category = 'placeholder'
        c.notes = f'Placeholder: "{original}"'
        return c

    # DIFF / spread items
    if lower == 'diff' or lower.startswith('diff '):
        c.commodity = 'Spread'
        c.rate_category = 'spread'
        c.notes = 'Price spread/differential indicator'
        return c

    # Dummy/placeholder rates (999999, all-zeros, all-None)
    if rate in (999999, 999998, 888888) or (not buy_rate and not sell_rate):
        c.rate_category = 'placeholder'
        c.notes = f'Dummy rate: {rate}'
        _detect_commodity(c, script_name, 0)
        return c

    # ── Numeric WinBull/SocketIO IDs ──────────────────────────────────

    if re.match(r'^\d+$', lower):
        c.rate_category = 'dealer_rate'
        c.notes = f'Numeric instrument ID: {lower}'
        _classify_by_rate_magnitude(c, rate)
        return c

    # ── Reference / international rates ───────────────────────────────

    # XAUUSD / Gold($) — but only if rate is actually in USD range
    if 'xau' in lower or ('gold' in lower and '$' in script_name and rate < 10000):
        c.commodity = 'XAUUSD'
        c.market_type = 'COMEX'
        c.rate_category = 'reference'
        c.weight = '1oz'
        c.weight_grams = 31.1035
        if 'am fix' in lower or 'amfix' in lower:
            c.notes = 'London AM Fix'
        elif 'pm fix' in lower or 'pmfix' in lower:
            c.notes = 'London PM Fix'
        return c

    # XAGUSD / Silver($) — only if rate is in USD range, not INR
    if 'xag' in lower or ('silver' in lower and '$' in script_name and rate < 1000):
        c.commodity = 'XAGUSD'
        c.market_type = 'COMEX'
        c.rate_category = 'reference'
        c.weight = '1oz'
        c.weight_grams = 31.1035
        return c

    # XPTUSD
    if 'xpt' in lower:
        c.commodity = 'XPTUSD'
        c.market_type = 'COMEX'
        c.rate_category = 'reference'
        c.weight = '1oz'
        c.weight_grams = 31.1035
        return c

    # USD/INR exchange rate
    if lower in ('inr', 'inr(₹)', 'inr (₹)', 'inrspot', 'dginrspot') or (
        'inr' in lower and rate and 60 < rate < 120
    ):
        c.commodity = 'USD/INR'
        c.market_type = 'Forex'
        c.rate_category = 'reference'
        return c

    # COMEX futures (GC/SI + month suffix)
    m = re.match(r'^(gc|si)(\d{2})(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)fut$', lower)
    if m:
        prefix, year, month = m.groups()
        c.commodity = 'XAUUSD' if prefix == 'gc' else 'XAGUSD'
        c.market_type = 'COMEX'
        c.rate_category = 'reference'
        c.delivery = f'Futures({month.title()}-{year})'
        c.weight = '1oz'
        c.weight_grams = 31.1035
        return c

    # Premium items
    if 'premium' in lower or 'prem' in lower:
        c.rate_category = 'premium'
        c.notes = 'Premium over base rate'
        # Check silver BEFORE the broad startswith('g') fallback
        if 'silver' in lower or 'sil' in lower:
            c.commodity = 'Silver'
        elif 'gold' in lower or lower.startswith('g'):
            c.commodity = 'Gold'
        _extract_location(c, script_name)
        return c

    # MCX reference
    if 'mcx' in lower:
        c.market_type = 'MCX'
        c.rate_category = 'reference'
        if 'gold' in lower:
            c.commodity = 'Gold'
        elif 'silver' in lower:
            c.commodity = 'Silver'
        return c

    # ── RSBL coded names (dealer-specific parsing — before generic) ──

    if dealer_id == 'rsbl':
        upper = script_name.upper().strip()
        if re.match(r'^\d+G', upper):
            c.commodity = 'Gold'
        elif upper.startswith('COIN'):
            c.commodity = 'Gold'
        elif re.match(r'^(?:RSBL|GAHD|GLD|GSRT|GOLD)', upper):
            c.commodity = 'Gold'
        elif re.match(r'^(?:SIL|SILVER)', upper):
            c.commodity = 'Silver'
        elif re.match(r'^PLAT', upper):
            c.commodity = 'Platinum'
        else:
            _detect_commodity(c, script_name, rate)
        _parse_rsbl_coded_name(c, script_name, rate)
        return c

    # ── Commodity detection ───────────────────────────────────────────

    _detect_commodity(c, script_name, rate)

    # ── Purity ────────────────────────────────────────────────────────

    _detect_purity(c, script_name)

    # ── Volume tier (order quantity range) ───────────────────────────

    is_vol_tier = _is_volume_tier(script_name)
    if is_vol_tier:
        c.min_qty = _extract_volume_tier(script_name)

    # ── Weight ────────────────────────────────────────────────────────
    #
    # If the script name specifies a weight, use it.
    # If it doesn't, weight stays None — we don't guess from rate magnitude.
    #
    # Lot-size detection (for non-RSBL dealers): when the named weight
    # doesn't match the rate vs. peer median, the weight is a lot/order
    # size, not the pricing unit. This uses _median_rates (computed once
    # per classify_all_rates call) instead of hardcoded price ranges.

    weight_str, weight_grams = _parse_weight(script_name, skip_volume_tier=is_vol_tier)
    if weight_str:
        c.weight = weight_str
        c.weight_grams = weight_grams

    # ── GST ───────────────────────────────────────────────────────────

    _detect_gst(c, script_name)

    # ── Delivery / futures ────────────────────────────────────────────

    _detect_delivery(c, script_name)

    # ── City / state / location ───────────────────────────────────────

    _extract_location(c, script_name)

    # ── Form (coin, bar, etc.) ────────────────────────────────────────

    _detect_form(c, script_name)

    # ── Market type finalization ──────────────────────────────────────

    if c.delivery and 'Futures' in c.delivery:
        c.market_type = 'Futures'

    return c


# ── Helpers ───────────────────────────────────────────────────────────────────

def _classify_by_rate_magnitude(c: RateClassification, rate: float):
    """Classify a numeric-ID item purely by its rate value."""
    if rate <= 0:
        c.commodity = 'Unknown'
        return

    # For numeric IDs, we can only detect commodity from rate magnitude.
    # Weight stays None — we don't guess pricing units from rates.
    # Reference rates (XAUUSD, XAGUSD, USD/INR) are exceptions since
    # their weight (1oz) is definitional, not inferred.
    if 60 < rate < 120:
        c.commodity = 'USD/INR'
        c.market_type = 'Forex'
        c.rate_category = 'reference'
    elif 3000 < rate < 6000:
        c.commodity = 'XAUUSD'
        c.market_type = 'COMEX'
        c.rate_category = 'reference'
        c.weight = '1oz'
        c.weight_grams = 31.1035
    elif 50 < rate <= 200:
        c.commodity = 'XAGUSD'
        c.market_type = 'COMEX'
        c.rate_category = 'reference'
        c.weight = '1oz'
        c.weight_grams = 31.1035
    elif 1500 < rate < 3500:
        c.commodity = 'XPTUSD'
        c.market_type = 'COMEX'
        c.rate_category = 'reference'
        c.weight = '1oz'
        c.weight_grams = 31.1035
    elif 5000 < rate < 25000:
        c.commodity = 'Gold'
    elif 25000 < rate < 100000:
        # Ambiguous zone: could be Silver per-kg (~85K) or Gold multi-gram
        # Can't determine without text context — leave Unknown for numeric IDs
        c.commodity = 'Unknown'
        c.notes = f'Ambiguous rate ~{rate}: possibly Silver/kg or Gold multi-gram'
    elif 100000 < rate < 200000:
        c.commodity = 'Gold'
    elif 200000 < rate < 500000:
        c.commodity = 'Silver'
    else:
        c.commodity = 'Unknown'
        c.notes = f'Unrecognized rate magnitude: {rate}'


def _detect_commodity(c: RateClassification, name: str, rate: float):
    """Detect commodity from script name keywords."""
    lower = name.lower()

    if any(w in lower for w in ['gold', 'gld', 'au ', ' au', 'sona', 'swarn']):
        c.commodity = 'Gold'
        return
    if any(w in lower for w in ['silver', 'slvr', 'ag ', ' ag', 'chandi', 'chaandi']):
        c.commodity = 'Silver'
        return
    if any(w in lower for w in ['platinum', 'plat']):
        c.commodity = 'Platinum'
        return
    if any(w in lower for w in ['copper', 'cu ']):
        c.commodity = 'Copper'
        return
    if lower.startswith('coin sil'):
        c.commodity = 'Silver'
        return

    # RSBL-style: starts with SIL = Silver, G/GOLD = Gold
    if lower.startswith('sil'):
        c.commodity = 'Silver'
        return
    if lower.startswith('g') and re.match(r'^g[a-z]{2,3}\d', lower):
        c.commodity = 'Gold'
        return

    # Jewelry
    if 'jewel' in lower:
        c.commodity = 'Gold'
        c.form = 'Jewelry'
        return

    # Rate-based fallback
    if rate > 0:
        _classify_by_rate_magnitude(c, rate)


def _detect_purity(c: RateClassification, name: str):
    """Detect purity from script name."""
    lower = name.lower()

    if '9999' in lower:
        c.purity = '9999'
    elif '999' in lower or 'fine' in lower:
        if '9999' not in lower:
            c.purity = '999'
    elif '99.5' in lower or '99.50' in lower or '9950' in lower:
        c.purity = '995'
    elif '995' in lower:
        c.purity = '995'
    elif any(k in lower for k in ['24k', '24kt', '24ct', '24 ct', '24 kt']):
        c.purity = '999'
    elif any(k in lower for k in ['22k', '22kt', '22ct', '22 ct', '22 kt', '916']):
        c.purity = '916'
    elif any(k in lower for k in ['18k', '18kt', '18ct', '18 ct', '750']):
        c.purity = '750'
    elif 'pure' in lower and c.commodity == 'Gold':
        c.purity = '999'
    elif 'tola' in lower or 'tezab' in lower:
        c.purity = '999'
    elif 'petal' in lower or 'guinea' in lower:
        c.purity = '916'

    # Purity-based commodity refinement
    if c.commodity == 'Unknown' and c.purity:
        if c.purity in ('999', '995', '916', '750', '9999'):
            c.commodity = 'Gold'


def _detect_gst(c: RateClassification, name: str):
    """Detect GST status from script name."""
    lower = name.lower()

    if 'without gst' in lower or 'excl' in lower or 'ex gst' in lower or 'gst extra' in lower:
        c.gst = 'ex-GST'
    elif 'with gst' in lower or 'incl' in lower or 'inc gst' in lower:
        c.gst = 'incl-GST'
    elif 'gst' in lower:
        c.gst = 'incl-GST'
    elif 'rtgs' in lower:
        c.gst = 'ex-GST'


def _detect_delivery(c: RateClassification, name: str):
    """Detect delivery terms from script name."""
    lower = name.lower()

    if 't+0' in lower or 'spot' in lower or 'ready' in lower:
        c.delivery = 'Spot'
    elif 't+1' in lower or 'next' in lower:
        c.delivery = 'T+1'
    elif 't+2' in lower:
        c.delivery = 'T+2'
    elif 'future' in lower or 'fut' in lower:
        c.delivery = 'Futures'
        c.market_type = 'Futures'
    elif 'rtgs' in lower:
        c.delivery = 'RTGS'

    # Month-year futures pattern — only if no delivery already detected
    if not c.delivery:
        m = re.search(r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\s\-]*(\d{2,4})', lower)
        if m:
            month = m.group(1).title()
            year = m.group(2)
            c.delivery = f'Futures({month}-{year})'
            c.market_type = 'Futures'

    # APR, MAR etc. at end (futures month reference)
    if not c.delivery:
        m = re.match(r'^.*\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*$', lower)
        if m:
            c.delivery = f'Futures({m.group(1).title()})'
            c.market_type = 'Futures'


def _extract_location(c: RateClassification, name: str):
    """Extract city and state from script name."""
    lower = name.lower()

    for pattern, state in _STATE_RE:
        if pattern.search(lower):
            c.state = state
            break

    for pattern, city, state in _CITY_RE:
        if pattern.search(lower):
            c.city = city
            if not c.state and state:
                c.state = state
            break


def _detect_form(c: RateClassification, name: str):
    """Detect physical form (coin, bar, etc.) from script name."""
    lower = name.lower()

    if c.form:
        return

    if any(w in lower for w in ['coin', 'coins']):
        c.form = 'Coin'
    elif any(w in lower for w in ['bar', 'salakha', 'brick']):
        c.form = 'Bar'
    elif 'biscuit' in lower:
        c.form = 'Biscuit'
    elif 'chorsa' in lower:
        c.form = 'Chorsa'
    elif 'peti' in lower:
        c.form = 'Peti'
    elif 'tola' in lower:
        c.form = 'Tola_Bar'
    elif 'petal' in lower or 'guinea' in lower:
        c.form = 'Petal'


def _parse_rsbl_coded_name(c: RateClassification, name: str, rate: float):
    """Parse RSBL's coded naming convention.

    RSBL is a refinery/mint — their weights ARE literal product weights,
    not lot sizes. Exempt from rate/weight validation.
    """
    upper = name.upper().strip()

    # Human-readable RSBL names (space-separated)
    if ' ' in name:
        _detect_purity(c, name)
        _detect_gst(c, name)
        _detect_delivery(c, name)
        _extract_location(c, name)
        _detect_form(c, name)

        # Volume tier detection
        if _is_volume_tier(name):
            c.min_qty = _extract_volume_tier(name)

        # RSBL weights are literal — no lot-size heuristic
        w_str, w_grams = _parse_weight(name)
        if w_str:
            c.weight = w_str
            c.weight_grams = w_grams
        # No weight in name → weight stays None (we don't guess)
        return

    # Coded format (no spaces)

    # Extract city code — match at known positions in RSBL naming convention:
    # GOLD{CITY}999, SIL{CITY}20KG, G{CITY}100T+2, etc.
    # Use anchored patterns to avoid substring false positives (e.g., 'UK' in 'BULK')
    for code, (city, state) in RSBL_CITY_CODES.items():
        # Match city code preceded by a commodity prefix or at a word-like boundary
        if re.search(r'(?:GOLD|GLD|SIL|SILVER|PLAT|\bG)' + code + r'(?:\d|$|T\+|PETI|CHORSA|999|995|100|1KG|20KG|5T)', upper):
            c.city = city
            if state:
                c.state = state
            break

    # Purity (check 9999 before 999 to avoid substring false match)
    if '9999' in upper:
        c.purity = '9999'
    elif '999' in upper:
        c.purity = '999'
    elif '995' in upper:
        c.purity = '995'
    # Note: '100' in RSBL coded names typically means 100g weight, not purity

    # Weight from coded format
    kg_match = re.search(r'(\d+)KG', upper)
    gm_match = re.search(r'(\d+)GM', upper)
    coin_g_match = re.search(r'COIN\d*G(\d+)', upper)
    leading_g_match = re.match(r'^(\d+)G', upper)

    raw_weight_str = None
    raw_weight_grams = None

    if kg_match:
        n = int(kg_match.group(1))
        raw_weight_str = f'{n}kg'
        raw_weight_grams = n * 1000.0
    elif gm_match:
        n = int(gm_match.group(1))
        raw_weight_str = f'{n}g'
        raw_weight_grams = float(n)
    elif coin_g_match:
        n = int(coin_g_match.group(1))
        raw_weight_str = f'{n}g'
        raw_weight_grams = float(n)
        c.form = 'Coin'
    elif leading_g_match:
        n = int(leading_g_match.group(1))
        raw_weight_str = f'{n}g'
        raw_weight_grams = float(n)

    # RSBL is a refinery/mint — their weights ARE literal product weights
    if raw_weight_str:
        c.weight = raw_weight_str
        c.weight_grams = raw_weight_grams
    # No weight in coded name → weight stays None (we don't guess)

    # Delivery
    if 'T+2' in upper:
        c.delivery = 'T+2'
    elif 'T+1' in upper:
        c.delivery = 'T+1'

    # Form
    if 'COIN' in upper:
        c.form = 'Coin'
    elif 'CHORSA' in upper:
        c.form = 'Chorsa'
    elif 'PETI' in upper:
        c.form = 'Peti'

    # Special: "S" suffix rates (SILAGR20KGS)
    if upper.endswith('S') and kg_match:
        c.notes = 'Per-unit rate (S suffix)'


# ── Batch classification ─────────────────────────────────────────────────────

def classify_dealer_rates(
    dealer_id: str,
    scripts: Dict,
) -> List[Dict]:
    """Classify all script names for a single dealer.

    Two-pass approach:
      Pass 1: Classify each item individually
      Pass 2: Use dealer-level context to resolve ambiguities
    """
    results = []
    classifications = []
    for symbol, rate_data in scripts.items():
        script_name = rate_data.get('script_name', symbol)
        buy_rate = rate_data.get('buy_rate')
        sell_rate = rate_data.get('sell_rate')

        classification = classify_rate(
            script_name=script_name,
            buy_rate=buy_rate,
            sell_rate=sell_rate,
            dealer_id=dealer_id,
        )
        classifications.append(classification)

        results.append({
            'dealer_id': dealer_id,
            'symbol': symbol,
            'script_name': script_name,
            'buy_rate': buy_rate,
            'sell_rate': sell_rate,
            'timestamp': rate_data.get('timestamp'),
            'classification': classification,
            'canonical_type': classification.canonical_type,
        })

    # Pass 2: Dealer-level context disambiguation
    _disambiguate_reference_rates(results, classifications)

    # Convert classification objects to dicts
    for result in results:
        c = result['classification']
        result['classification'] = c.to_dict()
        result['canonical_type'] = c.canonical_type

    return results


def _disambiguate_reference_rates(results: List[Dict], classifications: List[RateClassification]):
    """Resolve ambiguous items using dealer-level context."""
    has_gold_inr = False
    has_silver_inr = False
    for result, c in zip(results, classifications):
        rate = result.get('buy_rate') or result.get('sell_rate') or 0
        if c.commodity == 'Gold' and rate and 10000 < rate < 20000000:
            has_gold_inr = True
        if c.commodity == 'Silver' and rate and 10000 < rate < 500000:
            has_silver_inr = True

    for result, c in zip(results, classifications):
        rate = result.get('buy_rate') or result.get('sell_rate') or 0
        sn = result['script_name'].strip().lower()
        sn_clean = re.sub(r'[^a-z0-9\s]', '', sn).strip()
        sn_clean = re.sub(r'\s+', ' ', sn_clean)

        # "GOLD" / "GOLD SPOT" at XAUUSD range
        if (c.commodity == 'Gold' and has_gold_inr and 4000 < rate < 6000 and
                sn_clean in ('gold', 'gold spot', 'spot gold', 'goldfix', 'goldamfix',
                             'goldpmfix', 'gold comex', 'gold fix', 'gold am fix',
                             'gold pm fix', 'goldam fix', 'goldpm fix')):
            c.commodity = 'XAUUSD'
            c.market_type = 'COMEX'
            c.rate_category = 'reference'
            c.weight = '1oz'
            c.weight_grams = 31.1035
            if 'fix' in sn_clean:
                if 'am' in sn_clean:
                    c.notes = 'London AM Fix'
                elif 'pm' in sn_clean:
                    c.notes = 'London PM Fix'
                else:
                    c.notes = 'London Fix'

        # "SILVER" / "SILVER SPOT" at XAGUSD range
        if (c.commodity == 'Silver' and has_silver_inr and 50 < rate < 200 and
                sn_clean in ('silver', 'silver spot', 'spot silver', 'silverfix',
                             'silver fix', 'silver comex')):
            c.commodity = 'XAGUSD'
            c.market_type = 'COMEX'
            c.rate_category = 'reference'
            c.weight = '1oz'
            c.weight_grams = 31.1035
            if 'fix' in sn_clean:
                c.notes = 'London Fix'

        # "PLATINUM" at international price range
        if (c.commodity == 'Platinum' and 1500 < rate < 3500 and
                sn_clean in ('platinum', 'platinum spot')):
            c.commodity = 'XPTUSD'
            c.market_type = 'COMEX'
            c.rate_category = 'reference'
            c.weight = '1oz'
            c.weight_grams = 31.1035

        # Rate-magnitude fallback for generic names
        if (c.commodity == 'Gold' and c.rate_category == 'dealer_rate' and
                4000 < rate < 6000 and not c.purity and
                sn_clean in ('spot gold', 'gold spot')):
            c.commodity = 'XAUUSD'
            c.market_type = 'COMEX'
            c.rate_category = 'reference'
            c.weight = '1oz'
            c.weight_grams = 31.1035

        if (c.commodity == 'Silver' and c.rate_category == 'dealer_rate' and
                50 < rate < 200 and not c.purity and
                sn_clean in ('silver', 'silver spot', 'spot silver',
                             'silver comex', 'silver fix', 'silverfix')):
            c.commodity = 'XAGUSD'
            c.market_type = 'COMEX'
            c.rate_category = 'reference'
            c.weight = '1oz'
            c.weight_grams = 31.1035
            if 'fix' in sn_clean:
                c.notes = 'London Fix'


def classify_all_rates(current_rates: Dict) -> Dict[str, List[Dict]]:
    """Classify all rate line items across all dealers.

    Two-phase:
      1. Classify each dealer's items (per-item + per-dealer disambiguation)
      2. Lot-size detection using cross-dealer median rates
    """
    # Phase 1: Classify
    all_results = {}
    for dealer_id in sorted(current_rates.keys()):
        scripts = current_rates[dealer_id]
        all_results[dealer_id] = classify_dealer_rates(dealer_id, scripts)

    # Phase 2: Lot-size detection using median rates from Phase 1 results
    medians = _compute_median_rates(all_results)
    # Standard pricing units (median is per these units)
    median_unit_grams = {'Gold': 10.0, 'Silver': 1000.0}  # Gold per 10g, Silver per 1kg

    for dealer_id, items in all_results.items():
        if dealer_id == 'rsbl':
            continue  # RSBL is a refinery — weights are literal
        for item in items:
            c = item['classification']
            if isinstance(c, dict):
                commodity = c.get('commodity')
                weight = c.get('weight')
                weight_grams = c.get('weight_grams')
                rate_category = c.get('rate_category')
            else:
                continue

            if rate_category != 'dealer_rate' or not weight or not weight_grams:
                continue

            rate = item.get('buy_rate') or item.get('sell_rate') or 0
            if rate <= 0 or commodity not in medians:
                continue

            med = medians[commodity]
            med_grams = median_unit_grams.get(commodity)
            if not med or not med_grams:
                continue

            if not _rate_matches_weight(rate, weight_grams, med, med_grams):
                # Weight is a lot/order size, not the pricing unit.
                # Keep the weight as-is (the dealer named it intentionally,
                # and users search/filter by these labels). Just also set
                # min_qty to indicate it's a lot-size context.
                if not c.get('min_qty'):
                    c['min_qty'] = weight

    return all_results


def get_taxonomy_summary(classified: Dict[str, List[Dict]]) -> Dict:
    """Generate summary statistics from classified rates."""
    from collections import Counter

    all_items = []
    for items in classified.values():
        all_items.extend(items)

    summary = {
        'total_dealers': len(classified),
        'total_items': len(all_items),
        'commodity': dict(Counter(
            i['classification'].get('commodity', 'Unknown') for i in all_items
        )),
        'purity': dict(Counter(
            i['classification'].get('purity', 'Unknown') for i in all_items
        )),
        'weight': dict(Counter(
            i['classification'].get('weight', 'Unknown') for i in all_items
        )),
        'gst': dict(Counter(
            i['classification'].get('gst', 'Unknown') for i in all_items
        )),
        'market_type': dict(Counter(
            i['classification'].get('market_type', 'Spot') for i in all_items
        )),
        'rate_category': dict(Counter(
            i['classification'].get('rate_category', 'dealer_rate') for i in all_items
        )),
        'canonical_types': dict(Counter(
            i['canonical_type'] for i in all_items
        ).most_common(30)),
    }
    return summary


# ── Redis-cached taxonomy ─────────────────────────────────────────────────────

TAXONOMY_CACHE_KEY = "taxonomy:all"
TAXONOMY_SUMMARY_CACHE_KEY = "taxonomy:summary"
TAXONOMY_CACHE_TTL = 60  # seconds


async def get_cached_taxonomy(
    current_rates: Dict,
    dealer_id: Optional[str] = None,
    commodity: Optional[str] = None,
    category: Optional[str] = None,
) -> tuple:
    """Get taxonomy classification with Redis caching.

    Computes classification on cache miss, caches for TAXONOMY_CACHE_TTL seconds.
    Filters are applied after cache retrieval.
    """
    from app.database.connection import redis_manager

    classified = None
    summary = None

    # Try cache first
    try:
        cached = await redis_manager.get(TAXONOMY_CACHE_KEY)
        if cached:
            classified = _json.loads(cached)
            cached_summary = await redis_manager.get(TAXONOMY_SUMMARY_CACHE_KEY)
            if cached_summary:
                summary = _json.loads(cached_summary)
    except Exception as e:
        logger.debug(f"Taxonomy cache read failed: {e}")

    # Cache miss or partial miss — compute
    if classified is None or summary is None:
        if classified is None:
            import asyncio, copy
            # Deep copy: classify_all_rates runs in a worker thread and iterates
            # the inner per-dealer dicts. Without a deep copy, the event loop can
            # mutate those dicts concurrently via handle_new_rates → RuntimeError.
            safe_rates = copy.deepcopy(current_rates)
            classified = await asyncio.to_thread(classify_all_rates, safe_rates)
        if summary is None:
            summary = get_taxonomy_summary(classified)

        try:
            await redis_manager.set(
                TAXONOMY_CACHE_KEY,
                _json.dumps(classified, default=str),
                TAXONOMY_CACHE_TTL,
            )
            await redis_manager.set(
                TAXONOMY_SUMMARY_CACHE_KEY,
                _json.dumps(summary, default=str),
                TAXONOMY_CACHE_TTL,
            )
        except Exception as e:
            logger.debug(f"Taxonomy cache write failed: {e}")

    # Apply filters
    if dealer_id:
        classified = {dealer_id: classified[dealer_id]} if dealer_id in classified else {}

    if commodity or category:
        for did in list(classified.keys()):
            items = classified[did]
            if commodity:
                items = [i for i in items if i['classification'].get('commodity', '').lower() == commodity.lower()]
            if category:
                items = [i for i in items if i['classification'].get('rate_category', '').lower() == category.lower()]
            if items:
                classified[did] = items
            else:
                del classified[did]

    # Recompute summary only if filtered AND caller needs it
    if (dealer_id or commodity or category) and summary is not None:
        summary = get_taxonomy_summary(classified)

    return classified, summary
