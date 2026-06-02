"""
Goldie AI Agent — Tool definitions and executor.

8 tools the LLM can call. Each tool is a plain async function registered
via @tool decorator into TOOL_REGISTRY. The TOOL_DEFINITIONS list is sent
to Groq as the OpenAI-compatible "tools" parameter.

Action tools (create_alert, add_to_watchlist) return a pending_action
descriptor instead of executing immediately — the frontend must confirm.
"""

import asyncio
import json
import re
import secrets
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Callable, Dict, List, Tuple, Any

from app.database.connection import redis_manager
from app.services.agent_shared import (
    IST,
    format_rate,
    format_ist_from_utc,
    format_ist_now,
    normalize_dealer_id,
    load_dealer_metadata,
    dealer_display,
    standard_weight,
    filter_dealer_rates,
)
from app.services.rate_taxonomy import get_cached_taxonomy

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tool registry
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS: List[Dict] = []
TOOL_REGISTRY: Dict[str, Callable] = {}

# Action tools that require user confirmation
CONFIRMATION_TOOLS = {"add_to_watchlist"}


def tool(name: str, description: str, parameters: dict):
    """Decorator to register a tool function."""
    def decorator(fn):
        TOOL_DEFINITIONS.append({
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": parameters,
            }
        })
        TOOL_REGISTRY[name] = fn
        return fn
    return decorator


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _resolve_dealer(name: str, all_rates: dict) -> Optional[str]:
    """Resolve a user-provided dealer name to an exact key in all_rates.

    Tries (in order): exact match -> normalized exact -> substring -> reverse substring.
    """
    if name in all_rates:
        return name

    normalized = normalize_dealer_id(name)

    for d in all_rates:
        if normalize_dealer_id(d) == normalized:
            return d

    for d in all_rates:
        if normalized in normalize_dealer_id(d):
            return d

    for d in all_rates:
        if normalize_dealer_id(d) in normalized:
            return d

    return None


def _suggest_dealers(name: str, all_rates: dict, max_suggestions: int = 3) -> list:
    """Suggest closest dealer names using token overlap scoring."""
    name_tokens = set(re.sub(r"[^\w\s]", " ", name.lower()).split())
    if not name_tokens:
        return sorted(all_rates.keys())[:max_suggestions]

    scored = []
    for dealer_key in all_rates:
        dealer_tokens = set(re.sub(r"[^\w\s]", " ", dealer_key.lower()).split())
        overlap = len(name_tokens & dealer_tokens)
        name_norm = normalize_dealer_id(name)
        dk_norm = normalize_dealer_id(dealer_key)
        if name_norm in dk_norm or dk_norm in name_norm:
            overlap += 2
        if overlap > 0:
            scored.append((dealer_key, overlap))

    scored.sort(key=lambda x: -x[1])
    if scored:
        return [s[0] for s in scored[:max_suggestions]]
    return sorted(all_rates.keys())[:max_suggestions]


async def _get_taxonomy_and_meta(
    rate_service,
    current_rates=None,
) -> Tuple[Dict[str, List[Dict]], Dict[str, Dict]]:
    """Fetch taxonomy + dealer metadata in parallel. Returns (classified, meta).

    Accepts pre-fetched current_rates to avoid redundant calls.
    """
    if current_rates is None:
        current_rates = await rate_service.get_current_rates()
    (classified, _), meta = await asyncio.gather(
        get_cached_taxonomy(current_rates),
        load_dealer_metadata(),
    )
    return classified, meta


def _apply_taxonomy_filters(
    classified: Dict[str, List[Dict]],
    meta: Dict[str, Dict],
    commodity: Optional[str] = None,
    purity: Optional[str] = None,
    city: Optional[str] = None,
    dealer_id: Optional[str] = None,
) -> Dict[str, List[Dict]]:
    """Apply standard filters to taxonomy-classified rates. Pure function, no I/O.

    Uses the shared filter_dealer_rates from agent_shared.
    """
    std_wt = standard_weight(commodity)
    target = {dealer_id: classified[dealer_id]} if dealer_id and dealer_id in classified else classified

    filtered = {}
    for did, items in target.items():
        d_city = (meta.get(did) or {}).get('city')
        dealer_items = filter_dealer_rates(
            items, commodity, purity, city,
            dealer_city=d_city, std_weight=std_wt,
        )
        if dealer_items:
            filtered[did] = dealer_items
    return filtered


def _pick_best_script(items: List[Dict], commodity: Optional[str] = None) -> Optional[Dict]:
    """Pick the best matching script from classified items for a dealer.

    Prefers: standard weight > unknown weight, then shorter script_name (more standard).
    """
    if not items:
        return None

    std_wt = standard_weight(commodity)

    def score(item):
        c = item['classification']
        w = c.get('weight')
        if std_wt is None:
            weight_score = 0 if w is None else 1
        else:
            weight_score = 0 if w == std_wt else (1 if w is None else 2)
        return (weight_score, len(item.get('script_name', '')))

    return min(items, key=score)


def _build_formula_ast(
    d1_dealer: str, d1_symbol: str, d1_script: str,
    d2_dealer: str, d2_symbol: str, d2_script: str,
    rate_type: str, label: str,
) -> dict:
    """Build a calculator formula AST node for a two-dealer spread."""
    nonce = uuid.uuid4().hex[:8]
    return {
        "name": f"{d1_dealer} vs {d2_dealer}: {label}",
        "description": f"{rate_type.title()} rate spread for {label}",
        "ast": {
            "kind": "binary",
            "id": f"n_{nonce}_0",
            "op": "-",
            "left": {
                "kind": "rate_ref",
                "id": f"n_{nonce}_1",
                "competitor": d1_dealer,
                "symbol": d1_symbol,
                "rateType": rate_type,
                "displayName": f"{d1_dealer} {d1_script} {rate_type.title()}",
            },
            "right": {
                "kind": "rate_ref",
                "id": f"n_{nonce}_2",
                "competitor": d2_dealer,
                "symbol": d2_symbol,
                "rateType": rate_type,
                "displayName": f"{d2_dealer} {d2_script} {rate_type.title()}",
            },
        },
    }


def _build_comparison_formula(comparison: list, label: str) -> Optional[dict]:
    """Build a suggested formula from a dealer comparison result."""
    valid = [
        c for c in comparison
        if c.get("scripts") and not c.get("error") and len(c["scripts"]) > 0
    ]
    if len(valid) < 2:
        return None
    d1, d2 = valid[0], valid[1]
    s1, s2 = d1["scripts"][0], d2["scripts"][0]
    if s1.get("buy") and s2.get("buy"):
        rate_type = "buy"
    elif s1.get("sell") and s2.get("sell"):
        rate_type = "sell"
    else:
        return None
    return _build_formula_ast(
        d1["dealer"], s1["symbol"], s1["script"],
        d2["dealer"], s2["symbol"], s2["script"],
        rate_type, label,
    )


def _build_spread_formula(r1: dict, r2: dict, label: str) -> Optional[dict]:
    """Build a suggested formula from a spread calculation result."""
    if r1.get("buy") and r2.get("buy"):
        rate_type = "buy"
    elif r1.get("sell") and r2.get("sell"):
        rate_type = "sell"
    else:
        return None
    return _build_formula_ast(
        r1["dealer"], r1["symbol"], r1["script"],
        r2["dealer"], r2["symbol"], r2["script"],
        rate_type, label,
    )


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

@tool(
    "get_best_rate",
    "Find the best rates across all dealers for a given commodity. "
    "Buy rate = price dealer pays YOU (higher is better for consumer). "
    "Sell rate = price dealer charges YOU (lower is better for consumer). "
    "Returns highest buy rates and lowest sell rates. "
    "Use when the user asks 'best gold rate', 'cheapest gold 999', 'best silver rate', etc.",
    {
        "type": "object",
        "properties": {
            "commodity": {
                "type": "string",
                "enum": ["Gold", "Silver", "Platinum"],
                "description": "The metal. Always capitalize: Gold, Silver, Platinum.",
            },
            "purity": {
                "type": "string",
                "enum": ["999", "995", "916", "750", "9999"],
                "description": "Purity grade. Use 999 for standard gold/silver, 916 for 22k gold. Omit if user did not specify.",
            },
            "city": {
                "type": "string",
                "description": "Optional city filter, e.g. 'Mumbai', 'Chennai', 'Delhi'. Only set if user explicitly mentioned a city.",
            },
        },
        "required": ["commodity"],
    },
)
async def get_best_rate(commodity: str, purity: str = None, city: str = None, **ctx) -> dict:
    rate_service = ctx["rate_service"]
    all_rates = await rate_service.get_current_rates()
    classified, meta = await _get_taxonomy_and_meta(rate_service, all_rates)
    classified = _apply_taxonomy_filters(classified, meta, commodity, purity, city)

    buy_candidates = []
    sell_candidates = []

    for dealer_id, items in classified.items():
        for item in items:
            buy = item.get("buy_rate")
            sell = item.get("sell_rate")
            entry = {
                "dealer": dealer_display(dealer_id, meta),
                "dealer_id": dealer_id,
                "script": item.get("script_name", ""),
                "timestamp": format_ist_from_utc(item.get("timestamp")),
            }
            if buy and buy > 0:
                buy_candidates.append({**entry, "rate": buy, "rate_fmt": format_rate(buy)})
            if sell and sell > 0:
                sell_candidates.append({**entry, "rate": sell, "rate_fmt": format_rate(sell)})

    # Sort: highest buy (best for consumer selling), lowest sell (best for consumer buying)
    buy_candidates.sort(key=lambda x: -x["rate"])
    sell_candidates.sort(key=lambda x: x["rate"])

    std_wt = standard_weight(commodity)
    weight_label = f"per {std_wt}" if std_wt else "per unit"
    result = {"commodity": commodity, "purity": purity, "unit": weight_label, "city": city}

    if buy_candidates:
        result["best_buy"] = buy_candidates[0]
        if len(buy_candidates) > 1:
            result["top_buy_rates"] = buy_candidates[:5]

    if sell_candidates:
        result["best_sell"] = sell_candidates[0]
        if len(sell_candidates) > 1:
            result["top_sell_rates"] = sell_candidates[:5]

    result["total_matches"] = max(len(buy_candidates), len(sell_candidates))

    if not buy_candidates and not sell_candidates:
        result["error"] = (
            f"No {commodity}{' ' + purity if purity else ''} rates found"
            f"{' in ' + city if city else ''}. "
            "Try a different purity or omit the city filter."
        )

    return result


@tool(
    "get_live_rates",
    "Get all current rates for a specific dealer. Use when a user asks about "
    "a particular dealer's rates. The dealer_name should be lowercase with no spaces, "
    "e.g. 'kjbullion', 'csvbullion', 'rsbl', 'slnbullion'.",
    {
        "type": "object",
        "properties": {
            "dealer_name": {
                "type": "string",
                "description": "Dealer identifier, e.g. 'kjbullion', 'csvbullion', 'rsbl'",
            },
            "commodity": {
                "type": "string",
                "enum": ["Gold", "Silver", "Platinum"],
                "description": "Optional. Filter to show only this metal's rates.",
            },
            "purity": {
                "type": "string",
                "enum": ["999", "995", "916", "750", "9999"],
                "description": "Optional. Filter to a specific purity.",
            },
        },
        "required": ["dealer_name"],
    },
)
async def get_live_rates(dealer_name: str, commodity: str = None, purity: str = None, **ctx) -> dict:
    rate_service = ctx["rate_service"]
    all_rates = await rate_service.get_current_rates()

    matched = _resolve_dealer(dealer_name, all_rates)
    if not matched or matched not in all_rates:
        return {
            "error": f"No dealer found matching '{dealer_name}'. "
            "Use get_dealer_list to see available dealers."
        }

    # Fetch taxonomy + metadata once, filter in-memory
    classified, meta = await _get_taxonomy_and_meta(rate_service, all_rates)
    dealer_items = _apply_taxonomy_filters(
        classified, meta, commodity, purity, dealer_id=matched,
    ).get(matched, [])

    # If taxonomy filtering returned nothing, fall back to all dealer_rate items
    if not dealer_items and (commodity or purity):
        dealer_items = _apply_taxonomy_filters(
            classified, meta, dealer_id=matched,
        ).get(matched, [])

    rates_list = []
    for item in dealer_items:
        c = item['classification']
        rates_list.append({
            "script": item.get("script_name", ""),
            "buy": item.get("buy_rate"),
            "sell": item.get("sell_rate"),
            "buy_fmt": format_rate(item.get("buy_rate")),
            "sell_fmt": format_rate(item.get("sell_rate")),
            "commodity": c.get("commodity"),
            "purity": c.get("purity"),
            "gst": c.get("gst"),
            "timestamp": format_ist_from_utc(item.get("timestamp")),
        })

    display_name = dealer_display(matched, meta)
    return {"dealer": matched, "dealer_display": display_name, "rates": rates_list}


@tool(
    "compare_dealers",
    "Compare rates between two or more dealers for a specific commodity. "
    "Use when user asks to compare dealers side by side. "
    "Pass dealer names as lowercase identifiers (e.g. 'kjbullion', not 'KJ Bullion').",
    {
        "type": "object",
        "properties": {
            "dealers": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of dealer identifiers to compare, e.g. ['kjbullion', 'csvbullion']",
            },
            "commodity": {
                "type": "string",
                "enum": ["Gold", "Silver", "Platinum"],
                "description": "The metal to compare. Always capitalize.",
            },
            "purity": {
                "type": "string",
                "enum": ["999", "995", "916", "750", "9999"],
                "description": "Purity grade. Omit if user did not specify.",
            },
        },
        "required": ["dealers", "commodity"],
    },
)
async def compare_dealers(dealers: list, commodity: str, purity: str = None, **ctx) -> dict:
    rate_service = ctx["rate_service"]
    all_rates = await rate_service.get_current_rates()
    full_classified, meta = await _get_taxonomy_and_meta(rate_service, all_rates)
    classified = _apply_taxonomy_filters(full_classified, meta, commodity, purity)

    label = f"{commodity}{' ' + purity if purity else ''}"
    comparison = []
    for dealer_name in dealers:
        matched = _resolve_dealer(dealer_name, all_rates)
        if not matched:
            comparison.append({"dealer": dealer_name, "error": "Dealer not found"})
            continue

        items = classified.get(matched, [])
        best = _pick_best_script(items, commodity)
        if not best:
            comparison.append({
                "dealer": matched,
                "dealer_display": dealer_display(matched, meta),
                "scripts": [],
                "error": f"No {label} scripts found",
            })
            continue

        comparison.append({
            "dealer": matched,
            "dealer_display": dealer_display(matched, meta),
            "scripts": [{
                "script": best.get("script_name", ""),
                "symbol": best.get("symbol", ""),
                "buy": best.get("buy_rate"),
                "sell": best.get("sell_rate"),
                "buy_fmt": format_rate(best.get("buy_rate")),
                "sell_fmt": format_rate(best.get("sell_rate")),
                "timestamp": format_ist_from_utc(best.get("timestamp")),
            }],
        })

    result = {"comparison": comparison, "commodity": commodity, "purity": purity}

    formula = _build_comparison_formula(comparison, label)
    if formula:
        result["_suggested_formula"] = formula

    return result


@tool(
    "search_news",
    "Search commodity news articles. Use when user asks about gold news, market updates, "
    "import duty, price trends, etc. "
    "News articles are shown as clickable cards in the UI automatically. "
    "Briefly summarize the key themes — do NOT list individual articles or links.",
    {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search query, e.g. 'gold price', 'silver rally', 'import duty'",
            },
            "commodity": {
                "type": "string",
                "description": "Optional commodity filter",
                "enum": ["gold", "silver", "platinum", "palladium"],
            },
        },
        "required": ["query"],
    },
)
async def search_news(query: str, commodity: str = None, **ctx) -> dict:
    from app.services.news_service import news_service

    articles = []

    # Try Meilisearch full-text search first
    try:
        result = await news_service.search_articles(
            query=query, commodity=commodity, limit=5, offset=0,
        )
        if result:
            for hit in result.get("hits", [])[:5]:
                articles.append({
                    "title": hit.get("title"),
                    "summary": (hit.get("summary") or "")[:200],
                    "source": hit.get("source"),
                    "source_url": hit.get("source_url"),
                    "published_at": hit.get("published_at"),
                })
    except Exception as e:
        logger.debug("Meilisearch news search failed, falling back to DB: %s", e)

    # Fall back to PostgreSQL if Meilisearch returned nothing
    if not articles:
        try:
            # Map commodity filter to tag format used in DB
            commodity_tag = commodity.capitalize() if commodity else None
            db_result = await news_service.get_articles(
                commodity=commodity_tag, limit=5,
            )
            for art in db_result.get("articles", []):
                # art is a Pydantic NewsArticleResponse
                articles.append({
                    "title": art.title,
                    "summary": (art.summary or "")[:200],
                    "source": art.source,
                    "source_url": art.source_url,
                    "published_at": art.published_at.isoformat() if art.published_at else None,
                })
        except Exception as e:
            logger.error("News DB fallback also failed: %s", e)

    if not articles:
        return {"articles": [], "error": "No news articles found.", "query": query}

    return {
        "articles": articles,
        "total_hits": len(articles),
        "query": query,
    }


@tool(
    "calculate_spread",
    "Calculate the rate spread (difference) between two dealers for a specific commodity. "
    "Use for dealer-to-dealer spread analysis.",
    {
        "type": "object",
        "properties": {
            "dealer1": {"type": "string", "description": "First dealer identifier"},
            "dealer2": {"type": "string", "description": "Second dealer identifier"},
            "commodity": {
                "type": "string",
                "enum": ["Gold", "Silver", "Platinum"],
                "description": "The metal to compare.",
            },
            "purity": {
                "type": "string",
                "enum": ["999", "995", "916", "750", "9999"],
                "description": "Purity grade. Omit if user did not specify.",
            },
        },
        "required": ["dealer1", "dealer2", "commodity"],
    },
)
async def calculate_spread(dealer1: str, dealer2: str, commodity: str, purity: str = None, **ctx) -> dict:
    rate_service = ctx["rate_service"]
    all_rates = await rate_service.get_current_rates()
    full_classified, meta = await _get_taxonomy_and_meta(rate_service, all_rates)
    classified = _apply_taxonomy_filters(full_classified, meta, commodity, purity)

    label = f"{commodity}{' ' + purity if purity else ''}"

    def find_rate(dealer_name: str):
        matched = _resolve_dealer(dealer_name, all_rates)
        if not matched:
            return None
        items = classified.get(matched, [])
        best = _pick_best_script(items, commodity)
        if not best:
            return None
        return {
            "dealer": matched,
            "dealer_display": dealer_display(matched, meta),
            "script": best.get("script_name", ""),
            "symbol": best.get("symbol", ""),
            "buy": best.get("buy_rate"),
            "sell": best.get("sell_rate"),
            "buy_fmt": format_rate(best.get("buy_rate")),
            "sell_fmt": format_rate(best.get("sell_rate")),
            "timestamp": format_ist_from_utc(best.get("timestamp")),
        }

    r1 = find_rate(dealer1)
    r2 = find_rate(dealer2)

    if not r1:
        return {"error": f"No matching {label} rate found for '{dealer1}'"}
    if not r2:
        return {"error": f"No matching {label} rate found for '{dealer2}'"}

    result = {
        "dealer1": r1,
        "dealer2": r2,
        "commodity": commodity,
        "purity": purity,
    }
    if r1.get("buy") and r2.get("buy"):
        result["spread_buy"] = round(r1["buy"] - r2["buy"], 2)
        result["spread_buy_fmt"] = format_rate(abs(r1["buy"] - r2["buy"]))
    if r1.get("sell") and r2.get("sell"):
        result["spread_sell"] = round(r1["sell"] - r2["sell"], 2)
        result["spread_sell_fmt"] = format_rate(abs(r1["sell"] - r2["sell"]))

    formula = _build_spread_formula(r1, r2, label)
    if formula:
        result["_suggested_formula"] = formula

    return result


@tool(
    "create_alert",
    "Create a price alert for the user. The alert fires when a rate crosses "
    "the threshold. Creates the alert immediately (no confirmation needed). "
    "ALWAYS use this tool when the user asks to set an alert.",
    {
        "type": "object",
        "properties": {
            "dealer_name": {
                "type": "string",
                "description": "Dealer identifier (lowercase, no spaces), e.g. 'csvbullion'",
            },
            "commodity": {
                "type": "string",
                "enum": ["Gold", "Silver", "Platinum"],
                "description": "The metal to watch.",
            },
            "purity": {
                "type": "string",
                "enum": ["999", "995", "916", "750", "9999"],
                "description": "Purity of the rate to watch. Use 999 if user didn't specify.",
            },
            "condition": {
                "type": "string",
                "enum": ["above", "below"],
                "description": "Alert when rate goes above or below threshold",
            },
            "rate_type": {
                "type": "string",
                "enum": ["buy", "sell"],
                "description": "Which rate to monitor",
            },
            "threshold": {
                "type": "number",
                "description": "Price threshold in INR",
            },
        },
        "required": ["dealer_name", "commodity", "purity", "condition", "rate_type", "threshold"],
    },
)
async def create_alert(
    dealer_name: str, commodity: str, purity: str,
    condition: str, rate_type: str, threshold: float, **ctx,
) -> dict:
    rate_service = ctx["rate_service"]
    all_rates = await rate_service.get_current_rates()
    resolved_dealer = _resolve_dealer(dealer_name, all_rates)

    if not resolved_dealer:
        return {"error": f"Dealer '{dealer_name}' not found. Use get_dealer_list to check available dealers."}

    # Fetch taxonomy + metadata once, filter in-memory
    full_classified, meta = await _get_taxonomy_and_meta(rate_service, all_rates)
    dealer_items = _apply_taxonomy_filters(
        full_classified, meta, commodity, purity, dealer_id=resolved_dealer,
    ).get(resolved_dealer, [])
    best = _pick_best_script(dealer_items, commodity)

    if not best:
        # List what's available for this dealer (unfiltered)
        avail_items = _apply_taxonomy_filters(
            full_classified, meta, dealer_id=resolved_dealer,
        ).get(resolved_dealer, [])
        avail_labels = []
        for item in avail_items[:10]:
            c = item['classification']
            avail_labels.append(f"{c.get('commodity', '')} {c.get('purity', '')}".strip())
        return {
            "error": f"No {commodity} {purity} rates at {resolved_dealer}. "
            f"Available: {', '.join(avail_labels) or 'none'}"
        }

    matched_script = best.get("script_name", "")
    try:
        from app.services.alert_service import alert_service as _alert_svc
        from app.schemas.alerts import AlertCreate as AlertCreateSchema

        user_id = ctx["user_id"]
        alert_data = AlertCreateSchema(
            dealer_name=resolved_dealer,
            script_name=matched_script,
            condition=condition,
            rate_type=rate_type,
            threshold=threshold,
            trigger_mode="one_shot",
            cooldown_minutes=30,
        )
        alert = await _alert_svc.create_alert(user_id, alert_data)
        return {
            "status": "created",
            "alert_id": alert.id,
            "dealer": resolved_dealer,
            "dealer_display": dealer_display(resolved_dealer, meta),
            "script": matched_script,
            "condition": f"{rate_type.title()} rate {condition} {format_rate(threshold)}",
            "mode": "one_shot",
        }
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        logger.error("Failed to create alert from tool: %s", e)
        return {"error": "Failed to create alert. Please try again."}


@tool(
    "add_to_watchlist",
    "Add one or more dealer scripts to the user's watchlist. "
    "Validates dealer and script names against live data. "
    "For bulk adds (e.g. 'add gold 999 from top 3 dealers'), pass multiple items. "
    "Each item needs dealer_name and commodity (with optional purity).",
    {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "description": "Scripts to add. Each has dealer_name + commodity + optional purity.",
                "items": {
                    "type": "object",
                    "properties": {
                        "dealer_name": {
                            "type": "string",
                            "description": "Dealer identifier, e.g. 'kjbullion'. Fuzzy matching supported.",
                        },
                        "commodity": {
                            "type": "string",
                            "enum": ["Gold", "Silver", "Platinum"],
                            "description": "The metal to add.",
                        },
                        "purity": {
                            "type": "string",
                            "enum": ["999", "995", "916", "750", "9999"],
                            "description": "Omit if user did not specify purity.",
                        },
                    },
                    "required": ["dealer_name", "commodity"],
                },
                "minItems": 1,
                "maxItems": 20,
            },
            "watchlist_name": {
                "type": "string",
                "description": "Optional: name for a NEW watchlist to create. Only if user explicitly asks.",
            },
        },
        "required": ["items"],
    },
)
async def add_to_watchlist(items: list, watchlist_name: str = None, **ctx) -> dict:
    rate_service = ctx["rate_service"]
    all_rates = await rate_service.get_current_rates()

    # Fetch full taxonomy + metadata once for all items
    full_classified, meta = await _get_taxonomy_and_meta(rate_service, all_rates)

    validated = []
    errors = []

    for item in items:
        dealer_input = item.get("dealer_name", "")
        item_commodity = item.get("commodity", "Gold")
        item_purity = item.get("purity")

        resolved_dealer = _resolve_dealer(dealer_input, all_rates)
        if not resolved_dealer:
            suggestions = _suggest_dealers(dealer_input, all_rates)
            errors.append(
                f"Dealer '{dealer_input}' not found. Did you mean: {', '.join(suggestions)}?"
            )
            continue

        # Filter this dealer's taxonomy items using shared filter
        dealer_items = full_classified.get(resolved_dealer, [])
        matching = filter_dealer_rates(
            dealer_items, item_commodity, item_purity,
            std_weight=standard_weight(item_commodity),
        )
        best = _pick_best_script(matching, item_commodity)
        if not best:
            avail_labels = []
            for ti in dealer_items[:8]:
                c = ti['classification']
                if c.get('rate_category') == 'dealer_rate':
                    avail_labels.append(ti.get('script_name', ''))
            errors.append(
                f"No {item_commodity}{' ' + item_purity if item_purity else ''} script found at {resolved_dealer}. "
                f"Available: {', '.join(avail_labels)}"
            )
            continue

        validated.append({
            "dealer_name": resolved_dealer,
            "script_name": best.get("symbol", ""),       # symbol key for WebSocket matching
            "script_display_name": best.get("script_name", ""),  # human-readable name
            "product_type": item_commodity.lower(),
            "original_buy_rate": best.get("buy_rate"),
            "original_sell_rate": best.get("sell_rate"),
        })

    if not validated:
        return {"error": "; ".join(errors)}

    details = {}
    for i, v in enumerate(validated, 1):
        buy_str = format_rate(v["original_buy_rate"]) if v["original_buy_rate"] else "N/A"
        d_name = dealer_display(v["dealer_name"], meta)
        details[f"Script {i}"] = f"{d_name} — {v['script_display_name']} (Buy: {buy_str})"

    if errors:
        details["Skipped"] = f"{len(errors)} item(s) could not be resolved"

    summary = (
        f"Add {len(validated)} script{'s' if len(validated) != 1 else ''} to your watchlist"
    )

    result = {
        "requires_confirmation": True,
        "action": "add_to_watchlist",
        "params": {
            "scripts": validated,
        },
        "display": {
            "summary": summary,
            "details": details,
        },
    }
    if watchlist_name:
        result["params"]["watchlist_name"] = watchlist_name

    return result


@tool(
    "get_dealer_list",
    "Get a list of all available dealers being tracked. Use when the user asks which "
    "dealers are available. Returns dealer identifiers (lowercase, no spaces).",
    {
        "type": "object",
        "properties": {},
    },
)
async def get_dealer_list(**ctx) -> dict:
    rate_service = ctx["rate_service"]
    competitors_task = rate_service.get_competitors_list()
    meta_task = load_dealer_metadata()
    competitors, meta = await asyncio.gather(competitors_task, meta_task)
    dealers = []
    for d in sorted(competitors):
        dealers.append({
            "id": d,
            "name": dealer_display(d, meta),
        })
    return {"dealers": dealers, "count": len(dealers)}


DEALERS_PER_PAGE = 20


@tool(
    "get_dealers_by_city",
    "Find dealers in a specific city. Use when the user asks 'dealers in Mumbai', "
    "'gold dealers in Chennai', 'show me Delhi dealers', etc. "
    "Returns a paginated list of dealers with their scripts and live rates. "
    "Present results as numbered suggestions and ask the user which to add.",
    {
        "type": "object",
        "properties": {
            "city": {
                "type": "string",
                "description": "City name, e.g. 'Chennai', 'Mumbai', 'Delhi', 'Ahmedabad'",
            },
            "commodity": {
                "type": "string",
                "enum": ["Gold", "Silver", "Platinum"],
                "description": "Optional. Filter dealers that trade this metal.",
            },
            "purity": {
                "type": "string",
                "enum": ["999", "995", "916", "750", "9999"],
                "description": "Optional. Filter by purity within the commodity.",
            },
            "page": {
                "type": "integer",
                "description": "Page number for pagination (default 1). Each page shows 5 dealers.",
            },
        },
        "required": ["city"],
    },
)
async def get_dealers_by_city(city: str, commodity: str = None, purity: str = None, page: int = 1, **ctx) -> dict:
    rate_service = ctx["rate_service"]
    all_rates = await rate_service.get_current_rates()

    # Query DealerMetadata from PostgreSQL for city match
    matching_dealer_ids = []
    try:
        from app.database.connection import AsyncSessionLocal
        from app.database.models import DealerMetadata
        from sqlalchemy import func

        async with AsyncSessionLocal() as session:
            from sqlalchemy import select
            stmt = select(DealerMetadata).where(
                func.lower(DealerMetadata.city).contains(city.lower())
            )
            result = await session.execute(stmt)
            rows = result.scalars().all()
            for row in rows:
                if row.dealer_id in all_rates:
                    matching_dealer_ids.append({
                        "dealer_id": row.dealer_id,
                        "name": row.name or row.dealer_id,
                        "city": row.city,
                    })
    except Exception as e:
        logger.error("DealerMetadata query failed: %s", e)
        return {"error": f"City-based search is temporarily unavailable. Use get_dealer_list to see all dealers."}

    if not matching_dealer_ids:
        return {
            "city": city,
            "dealers": [],
            "error": f"No dealers found in '{city}' with live rate data. Try a different city or use get_dealer_list.",
        }

    total_dealers = len(matching_dealer_ids)

    # Paginate
    start = (page - 1) * DEALERS_PER_PAGE
    end = start + DEALERS_PER_PAGE
    page_dealers = matching_dealer_ids[start:end]

    # Fetch taxonomy + metadata once (not per-dealer)
    full_classified, meta = await _get_taxonomy_and_meta(rate_service, all_rates)
    if commodity or purity:
        classified = _apply_taxonomy_filters(full_classified, meta, commodity, purity)
    else:
        classified = None

    dealers_output = []
    for dealer_info in page_dealers:
        did = dealer_info["dealer_id"]

        if classified is not None:
            items = classified.get(did, [])
            scripts_out = []
            for item in items:
                scripts_out.append({
                    "symbol": item.get("symbol", ""),
                    "script_name": item.get("script_name", ""),
                    "buy": item.get("buy_rate"),
                    "sell": item.get("sell_rate"),
                    "buy_fmt": format_rate(item.get("buy_rate")),
                    "sell_fmt": format_rate(item.get("sell_rate")),
                    "timestamp": format_ist_from_utc(item.get("timestamp")),
                })
            dealers_output.append({
                "dealer_id": did,
                "name": dealer_info["name"],
                "city": dealer_info["city"],
                "scripts": scripts_out,
            })
        else:
            # No filter — count dealer_rate items from pre-fetched taxonomy
            dealer_items = full_classified.get(did, [])
            spot_count = sum(
                1 for i in dealer_items
                if i['classification'].get('rate_category') == 'dealer_rate'
            )
            dealers_output.append({
                "dealer_id": did,
                "name": dealer_info["name"],
                "city": dealer_info["city"],
                "script_count": spot_count,
            })

    return {
        "city": city,
        "dealers": dealers_output,
        "page": page,
        "total_dealers": total_dealers,
        "has_more": end < total_dealers,
    }


@tool(
    "save_calculation",
    "Save an arithmetic formula as a tracked calculation. The formula compares two "
    "dealer rates using an operator (+, -, *, /). Use when the user says 'save this "
    "calculation', 'track the spread', 'save the difference between X and Y'. "
    "Each operand needs a dealer_name, commodity, and rate_type (buy or sell).",
    {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "Name for the calculation, e.g. 'KJ vs CSV Gold 999 Spread'",
            },
            "operands": {
                "type": "array",
                "description": "Exactly 2 operands. Each has dealer_name, commodity, rate_type.",
                "items": {
                    "type": "object",
                    "properties": {
                        "dealer_name": {
                            "type": "string",
                            "description": "Dealer identifier, e.g. 'kjbullion'",
                        },
                        "commodity": {
                            "type": "string",
                            "enum": ["Gold", "Silver", "Platinum"],
                            "description": "The metal.",
                        },
                        "purity": {
                            "type": "string",
                            "enum": ["999", "995", "916", "750", "9999"],
                            "description": "Purity grade.",
                        },
                        "rate_type": {
                            "type": "string",
                            "enum": ["buy", "sell"],
                            "description": "Which rate to use in the formula",
                        },
                    },
                    "required": ["dealer_name", "commodity", "rate_type"],
                },
                "minItems": 2,
                "maxItems": 2,
            },
            "operator": {
                "type": "string",
                "enum": ["+", "-", "*", "/"],
                "description": "Arithmetic operator for the formula",
            },
            "description": {
                "type": "string",
                "description": "Optional description of the calculation",
            },
        },
        "required": ["name", "operands", "operator"],
    },
)
async def save_calculation(
    name: str, operands: list, operator: str,
    description: str = None, **ctx,
) -> dict:
    rate_service = ctx["rate_service"]
    user_id = ctx["user_id"]
    all_rates = await rate_service.get_current_rates()

    # Fetch taxonomy + metadata once for all operands
    full_classified, meta = await _get_taxonomy_and_meta(rate_service, all_rates)

    resolved = []
    for i, op in enumerate(operands):
        dealer_input = op.get("dealer_name", "")
        op_commodity = op.get("commodity", "Gold")
        op_purity = op.get("purity")
        rate_type = op.get("rate_type", "buy")

        dealer_key = _resolve_dealer(dealer_input, all_rates)
        if not dealer_key:
            suggestions = _suggest_dealers(dealer_input, all_rates)
            return {"error": f"Dealer '{dealer_input}' not found. Did you mean: {', '.join(suggestions)}?"}

        dealer_items = _apply_taxonomy_filters(
            full_classified, meta, op_commodity, op_purity, dealer_id=dealer_key,
        ).get(dealer_key, [])
        best = _pick_best_script(dealer_items, op_commodity)

        if not best:
            return {"error": f"No {op_commodity}{' ' + op_purity if op_purity else ''} script found at {dealer_key}."}

        resolved.append({
            "dealer": dealer_key,
            "symbol": best.get("symbol", ""),
            "script_name": best.get("script_name", ""),
            "rate_type": rate_type,
        })

    # Build formula AST
    nonce = uuid.uuid4().hex[:8]
    ast = {
        "kind": "binary",
        "id": f"n_{nonce}_0",
        "op": operator,
        "left": {
            "kind": "rate_ref",
            "id": f"n_{nonce}_1",
            "competitor": resolved[0]["dealer"],
            "symbol": resolved[0]["symbol"],
            "rateType": resolved[0]["rate_type"],
            "displayName": f"{resolved[0]['dealer']} {resolved[0]['script_name']} {resolved[0]['rate_type'].title()}",
        },
        "right": {
            "kind": "rate_ref",
            "id": f"n_{nonce}_2",
            "competitor": resolved[1]["dealer"],
            "symbol": resolved[1]["symbol"],
            "rateType": resolved[1]["rate_type"],
            "displayName": f"{resolved[1]['dealer']} {resolved[1]['script_name']} {resolved[1]['rate_type'].title()}",
        },
    }

    try:
        from app.services.calculator_service import calculator_service
        from app.schemas.calculator import FormulaCreate

        formula = await calculator_service.create_formula(
            user_id,
            FormulaCreate(name=name, description=description, ast=ast),
        )
        return {
            "status": "created",
            "formula_id": formula.id,
            "name": formula.name,
        }
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        logger.error("Failed to save calculation: %s", e)
        return {"error": "Failed to save calculation. Please try again."}


# ---------------------------------------------------------------------------
# Tool executor
# ---------------------------------------------------------------------------

async def execute_tool(
    name: str,
    args: dict,
    user_id: str,
    session_id: str,
    rate_service: Any,
) -> Tuple[str, Optional[dict], List[dict]]:
    """Execute a tool and return (result_json, pending_action, suggested_actions).

    - pending_action: confirmation action stored in Redis (create_alert, etc.)
    - suggested_actions: non-destructive shortcuts (save_calculation, etc.)
    """
    fn = TOOL_REGISTRY.get(name)
    if not fn:
        return json.dumps({"error": f"Unknown tool: {name}"}), None, []

    try:
        result = await fn(**args, rate_service=rate_service, user_id=user_id)
    except Exception as e:
        logger.error("Tool %s execution error: %s", name, e)
        return json.dumps({"error": f"Tool '{name}' failed: {str(e)}"}), None, []

    # Extract suggested formulas before serialization
    suggested_actions: List[dict] = []
    formula = result.pop("_suggested_formula", None)
    if formula:
        suggested_actions.append({
            "type": "save_calculation",
            "label": "Save as calculation",
            "formula": formula,
        })

    # Handle confirmation tools
    pending_action = None
    if result.get("requires_confirmation"):
        nonce = secrets.token_urlsafe(16)
        pending_payload = {
            "user_id": user_id,
            "action": result["action"],
            "params": result["params"],
        }
        # Store in Redis with 5-minute TTL
        pending_key = f"goldie:pending:{session_id}:{nonce}"
        await redis_manager.set(pending_key, json.dumps(pending_payload), expire=300)

        pending_action = {
            "nonce": nonce,
            "action": result["action"],
            "display": result["display"],
        }
        # Give the LLM a clean result — explicitly tell it NOT to claim the action is done
        result = {
            "status": "pending_confirmation",
            "summary": result["display"]["summary"],
            "instruction": "A confirmation card is shown to the user. Ask them to tap Confirm. Do NOT say the action is done or processed — it has NOT been executed yet.",
        }

    return json.dumps(result, default=str), pending_action, suggested_actions
