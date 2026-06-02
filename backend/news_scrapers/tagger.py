"""
Keyword-based article tagging engine.
Pure function: no I/O, no external dependencies, fully testable.
"""

from typing import Optional


# ---------------------------------------------------------------------------
# Keyword rule tables — first match wins per category
# ---------------------------------------------------------------------------

COMMODITY_RULES: list[tuple[str, list[str]]] = [
    ("Gold",       ["gold", "aurum", "xau", "sovereign gold", "sgb"]),
    ("Silver",     ["silver", "xag"]),
    ("Platinum",   ["platinum", "xpt"]),
    ("Palladium",  ["palladium", "xpd"]),
    ("Crude Oil",  ["crude", "brent", "wti", "petroleum", "oil price"]),
    ("Copper",     ["copper"]),
    ("Aluminium",  ["aluminium", "aluminum"]),
    ("Zinc",       ["zinc"]),
    ("Natural Gas", ["natural gas", "natgas", "lng"]),
]

TOPIC_RULES: list[tuple[str, list[str]]] = [
    ("Price Movement", ["surges", "plunges", "rally", "drops", "falls", "rises",
                        "hits record", "all-time high", "declines", "climbs",
                        "up by", "down by", "percent", "price"]),
    ("MCX",            ["mcx", "multi commodity exchange"]),
    ("COMEX",          ["comex", "nymex"]),
    ("Budget",         ["budget", "fiscal", "import duty", "excise", "gst"]),
    ("Import/Export",  ["import", "export", "smuggling", "customs"]),
    ("Central Bank",   ["rbi", "federal reserve", "fed rate", "interest rate",
                        "monetary policy", "repo rate"]),
    ("ETF",            ["etf", "exchange traded fund", "gold etf"]),
    ("Jewellery",      ["jewellery", "jewelry", "hallmark", "gems"]),
    ("Demand/Supply",  ["demand", "supply", "consumption", "production", "mining"]),
]

GEOGRAPHY_RULES: list[tuple[str, list[str]]] = [
    ("India",  ["india", "indian", "rupee", "inr", "delhi", "mumbai",
                "sensex", "nifty", "sebi", "rbi"]),
    ("US",     ["u.s.", "united states", "dollar", "usd",
                "wall street", "new york", "federal reserve"]),
    ("China",  ["china", "chinese", "yuan", "shanghai", "beijing"]),
    ("UAE",    ["uae", "dubai", "dirham", "gulf"]),
    ("Europe", ["europe", "euro", "ecb", "london", "lbma"]),
    ("Global", ["global", "world", "international", "worldwide"]),
]

BULLISH_KEYWORDS = [
    "surges", "rally", "rises", "bullish", "gains", "hits record",
    "all-time high", "strong demand", "positive", "upside",
    "climbing", "outperforms",
]

BEARISH_KEYWORDS = [
    "falls", "drops", "plunges", "bearish", "decline", "slumps",
    "weakens", "sell-off", "negative", "downside", "correction",
]


def tag_article(title: str, summary: Optional[str] = None) -> dict:
    """
    Apply keyword rules to article title + summary.
    Returns dict with keys: commodity, topic, geography, sentiment.
    All values are Optional[str]. First match wins per category.
    Sentiment uses score comparison (bullish count vs bearish count).
    """
    combined = f"{title or ''} {summary or ''}".lower()

    def first_match(rules):
        for label, keywords in rules:
            if any(kw in combined for kw in keywords):
                return label
        return None

    # Sentiment: count hits, compare. None if no signal at all.
    bullish_score = sum(1 for kw in BULLISH_KEYWORDS if kw in combined)
    bearish_score = sum(1 for kw in BEARISH_KEYWORDS if kw in combined)
    if bullish_score > bearish_score:
        sentiment = "Bullish"
    elif bearish_score > bullish_score:
        sentiment = "Bearish"
    elif bullish_score > 0:
        sentiment = "Neutral"
    else:
        sentiment = None

    return {
        "commodity": first_match(COMMODITY_RULES),
        "topic": first_match(TOPIC_RULES),
        "geography": first_match(GEOGRAPHY_RULES),
        "sentiment": sentiment,
    }
