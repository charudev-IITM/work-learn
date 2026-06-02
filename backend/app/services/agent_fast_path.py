"""
SONA AI Fast Path — Answers common bullion queries without LLM round-trip.

When a user asks "gold rate", "best silver 999", or "kjbullion rates", the
fast path resolves the query using taxonomy-enriched rate data and returns
a formatted response directly. Zero LLM cost, <100ms latency.

If the query can't be confidently resolved, returns None and the caller
falls through to the full LLM path.

Supported intents:
  - best_rate:    "gold rate", "best silver 999", "cheapest gold 995"
  - dealer_rates: "kjbullion rates", "rates at csvbullion"
  - dealer_list:  "show dealers", "dealer list", "how many dealers"
  - compare:      "compare kj and csv gold" (2 dealers)

NOT handled (falls through to LLM):
  - Multi-turn conversation (follow-up questions)
  - News queries
  - Alerts / watchlist actions
  - Complex reasoning ("why is gold cheaper in Mumbai?")
  - Anything the parser isn't confident about
"""

import asyncio
import re
import logging
from typing import Optional, Dict, List

from app.services.rate_taxonomy import (
    classify_all_rates,
    get_cached_taxonomy,
)
from app.services.agent_shared import (
    format_rate,
    format_ist_now,
    normalize_dealer_id,
    load_dealer_metadata,
    dealer_display,
    standard_weight,
    filter_dealer_rates,
    COMMODITY_KEYWORDS,
    PURITY_KEYWORDS,
    GST_KEYWORDS,
    CITY_ALIASES,
    cities_match,
)

logger = logging.getLogger(__name__)


# ── Entity extraction ─────────────────────────────────────────────────────────

INTENT_PATTERNS = [
    # Dealer list: "show dealers", "dealer list", "how many dealers"
    ('dealer_list', re.compile(
        r'\b(?:show|list|all|how\s+many)\b.*\b(?:dealer|dealers)\b'
        r'|\b(?:dealer|dealers)\b.*\b(?:list|show|all)\b'
        r'|\bkitne\s+dealer\b',
        re.I,
    )),
    # Compare: "compare kj and csv gold", "kj vs csv"
    # Non-greedy .*? so captures grab words immediately adjacent to and/vs
    ('compare', re.compile(
        r'\b(?:compare|difference|diff)\b.*?\b(\w+)\s+(?:and|vs|versus|&)\s+(\w+)\b'
        r'|\b(\w+)\s+(?:vs|versus)\s+(\w+)\b',
        re.I,
    )),
    # Dealer-specific rates: "kjbullion rates", "rates at csvbullion"
    ('dealer_rates', re.compile(
        r'\b(?:rates?\s+(?:at|for|of|from)\s+)(\w+)'
        r'|\b(?:show|get)\s+(?:me\s+)?(?:rates?\s+(?:at|for|of|from)\s+)?(\w+)\s+rates?\b'
        r'|^(\w+(?:bullion|gold|jewel\w*|spot|traders?))\s+(?:rates?|prices?)?\s*$',
        re.I,
    )),
    # Best rate: "gold rate", "best silver 999", "cheapest gold", "gold 995 price"
    ('best_rate', re.compile(
        r'\b(?:best|cheapest|lowest|highest|top)\b.*\b(?:rate|price|cost)\b'
        r'|\b(?:gold|silver|platinum|copper|sona|chandi)\b.*\b(?:rate|price|cost|kitna|ka\s+rate)\b'
        r'|\b(?:rate|price|cost)\b.*\b(?:gold|silver|platinum|copper|sona|chandi)\b'
        r'|\b(?:gold|silver|platinum|sona|chandi)\b\s*(?:999|995|916|9999)\s*(?:rate|price)?\s*$'
        r'|\b(?:gold|silver|sona|chandi)\b\s*$'
        r'|\b(?:gold|silver)\s+(?:999|995|916)\s+(?:rate|price)\b'
        r'|\b(?:best|cheapest)\s+(?:gold|silver|sona|chandi)\b'
        r'|\b(?:show|get)\s+(?:me\s+)?(?:gold|silver|platinum|sona|chandi)\b.*\b(?:rate|price)s?\b',
        re.I,
    )),
]


def _extract_entities(message: str) -> Dict:
    """Extract commodity, purity, city, gst, dealer from user message."""
    lower = message.lower().strip()
    entities = {}

    for kw, commodity in COMMODITY_KEYWORDS.items():
        if kw in lower:
            entities['commodity'] = commodity
            break

    for kw in sorted(PURITY_KEYWORDS.keys(), key=len, reverse=True):
        if kw in lower:
            entities['purity'] = PURITY_KEYWORDS[kw]
            break

    for kw, city in CITY_ALIASES.items():
        if kw in lower:
            entities['city'] = city
            break

    for kw in sorted(GST_KEYWORDS.keys(), key=len, reverse=True):
        if kw in lower:
            entities['gst'] = GST_KEYWORDS[kw]
            break

    return entities


def _resolve_dealer(name: str, known_dealers: List[str]) -> Optional[str]:
    """Fuzzy-resolve a dealer name from user input against known dealer IDs."""
    clean = normalize_dealer_id(name)
    if not clean:
        return None

    if clean in known_dealers:
        return clean

    matches = [d for d in known_dealers if d.startswith(clean)]
    if len(matches) == 1:
        return matches[0]

    matches = [d for d in known_dealers if clean in d]
    if len(matches) == 1:
        return matches[0]

    matches = [d for d in known_dealers if d in clean]
    if len(matches) == 1:
        return matches[0]

    return None


# ── Intent handlers ───────────────────────────────────────────────────────────


def _rate_annotation(c: Dict) -> str:
    """Return a bracket annotation for non-standard GST/delivery rates.

    Returns empty string for standard incl-GST spot rates so the common
    case stays uncluttered. Returns e.g. ' [ex-GST]' or ' [RTGS, ex-GST]'
    for anything non-standard.
    """
    parts = []
    gst_val = c.get('gst')
    delivery = c.get('delivery')
    if gst_val and gst_val != 'incl-GST':
        parts.append(gst_val)
    if delivery and delivery != 'Spot':
        parts.append(delivery)
    return f" [{', '.join(parts)}]" if parts else ''


def _handle_best_rate(
    classified: Dict[str, List[Dict]],
    entities: Dict,
    meta: Dict[str, Dict] = None,
) -> Optional[str]:
    """Handle 'best gold rate', 'silver 999 price', etc."""
    commodity = entities.get('commodity', 'Gold')
    purity = entities.get('purity')
    city = entities.get('city')
    gst = entities.get('gst')

    # Default purity to 999 for gold if not specified
    if not purity and commodity == 'Gold':
        purity = '999'

    # Show all rates — incl. ex-GST and futures — and annotate them clearly.
    # The user decides what's relevant; we never silently filter.
    std_wt = standard_weight(commodity)
    _m = meta or {}
    candidates = []
    for dealer_id, items in classified.items():
        d_city = (_m.get(dealer_id) or {}).get('city')
        candidates.extend(filter_dealer_rates(
            items, commodity, purity, city, gst,
            dealer_city=d_city, std_weight=std_wt,
        ))

    if not candidates:
        return None

    buy_items = [(i, i['buy_rate']) for i in candidates if i.get('buy_rate') and i['buy_rate'] > 0]
    sell_items = [(i, i['sell_rate']) for i in candidates if i.get('sell_rate') and i['sell_rate'] > 0]

    buy_items.sort(key=lambda x: -x[1])
    sell_items.sort(key=lambda x: x[1])

    purity_label = f' {purity}' if purity else ''
    city_label = f' in {city}' if city else ''
    gst_label = f' ({gst})' if gst else ''
    weight_label = 'per 10g' if std_wt == '10g' else 'per kg'

    lines = []
    lines.append(f"**{commodity}{purity_label} rates{city_label}{gst_label}** ({weight_label}, {format_ist_now()})")
    lines.append("")

    if sell_items:
        best = sell_items[0][0]
        c = best['classification']
        ann = _rate_annotation(c)
        detail_parts = []
        if c.get('purity') and not purity:
            detail_parts.append(c['purity'])
        if c.get('min_qty'):
            detail_parts.append(f'qty: {c["min_qty"]}')
        detail = f" ({', '.join(detail_parts)})" if detail_parts else ''
        note = ''
        if ann:
            note = '\n  _(ex-GST/futures rate — add applicable GST for all-inclusive price)_'
        lines.append(f"**Best sell (buy from dealer):** {format_rate(best['sell_rate'])} at {dealer_display(best['dealer_id'], _m)}{ann}{detail}{note}")

        if len(sell_items) > 1:
            lines.append("")
            lines.append("Top 5 sell rates:")
            for item, rate in sell_items[:5]:
                c = item['classification']
                pinfo = f" [{c.get('purity', '')}]" if c.get('purity') and not purity else ''
                ann = _rate_annotation(c)
                lines.append(f"  {dealer_display(item['dealer_id'], _m)}: {format_rate(rate)}{pinfo}{ann}")

    if buy_items:
        best = buy_items[0][0]
        c = best['classification']
        ann = _rate_annotation(c)
        detail_parts = []
        if c.get('purity') and not purity:
            detail_parts.append(c['purity'])
        if c.get('min_qty'):
            detail_parts.append(f'qty: {c["min_qty"]}')
        detail = f" ({', '.join(detail_parts)})" if detail_parts else ''
        note = ''
        if ann:
            note = '\n  _(ex-GST/futures rate — effective payout may differ after GST)_'
        lines.append("")
        lines.append(f"**Best buy (sell to dealer):** {format_rate(best['buy_rate'])} at {dealer_display(best['dealer_id'], _m)}{ann}{detail}{note}")

        if len(buy_items) > 1:
            lines.append("")
            lines.append("Top 5 buy rates:")
            for item, rate in buy_items[:5]:
                c = item['classification']
                pinfo = f" [{c.get('purity', '')}]" if c.get('purity') and not purity else ''
                ann = _rate_annotation(c)
                lines.append(f"  {dealer_display(item['dealer_id'], _m)}: {format_rate(rate)}{pinfo}{ann}")

    unique_dealers = len(set(i['dealer_id'] for i in candidates))
    lines.append("")
    lines.append(f"_{unique_dealers} dealers matched — all rate types shown. Ask for specific purity, city, or GST filter._")

    return '\n'.join(lines)


def _handle_dealer_rates(
    classified: Dict[str, List[Dict]],
    dealer_id: str,
    entities: Dict,
    meta: Dict[str, Dict] = None,
) -> Optional[str]:
    """Handle 'kjbullion rates', 'show rsbl rates'."""
    items = classified.get(dealer_id)
    if not items:
        return None

    commodity = entities.get('commodity')
    dealer_items = filter_dealer_rates(items, commodity=commodity)

    if not dealer_items:
        dealer_items = filter_dealer_rates(items)

    if not dealer_items:
        return None

    _m = meta or {}
    display_name = dealer_display(dealer_id, _m)
    lines = []
    lines.append(f"**{display_name}** — {len(dealer_items)} rates ({format_ist_now()})")
    lines.append("")

    for item in dealer_items:
        c = item['classification']
        # Show original script name, with taxonomy annotation for context
        script = item.get('script_name', '')
        ann = _rate_annotation(c)

        buy = format_rate(item.get('buy_rate'))
        sell = format_rate(item.get('sell_rate'))
        lines.append(f"  {script}: Buy {buy} / Sell {sell}{ann}")

    return '\n'.join(lines)


def _handle_dealer_list(
    classified: Dict[str, List[Dict]],
    meta: Dict[str, Dict] = None,
) -> Optional[str]:
    """Handle 'show dealers', 'dealer list'."""
    _m = meta or {}
    active = {d for d, items in classified.items()
              if any(i['classification'].get('rate_category') == 'dealer_rate' for i in items)}

    lines = []
    lines.append(f"**{len(active)} dealers** with live rates ({format_ist_now()})")
    lines.append("")

    gold_dealers = set()
    silver_dealers = set()
    for d, items in classified.items():
        for i in items:
            c = i['classification']
            if c.get('rate_category') != 'dealer_rate':
                continue
            if c.get('commodity') == 'Gold':
                gold_dealers.add(d)
            elif c.get('commodity') == 'Silver':
                silver_dealers.add(d)

    lines.append(f"Gold: {len(gold_dealers)} dealers | Silver: {len(silver_dealers)} dealers")
    lines.append("")

    display_names = [dealer_display(d, _m) for d in sorted(active)[:25]]
    lines.append("Dealers: " + ', '.join(display_names))
    if len(active) > 25:
        lines.append(f"_...and {len(active) - 25} more_")

    return '\n'.join(lines)


def _handle_compare(
    classified: Dict[str, List[Dict]],
    dealer1: str,
    dealer2: str,
    entities: Dict,
    meta: Dict[str, Dict] = None,
) -> Optional[str]:
    """Handle 'compare kj and csv gold'."""
    items1 = classified.get(dealer1)
    items2 = classified.get(dealer2)
    if not items1 or not items2:
        return None

    _m = meta or {}
    commodity = entities.get('commodity', 'Gold')
    purity = entities.get('purity')

    rates1 = filter_dealer_rates(items1, commodity, purity)
    rates2 = filter_dealer_rates(items2, commodity, purity)

    if not rates1 or not rates2:
        return None

    def _best_by_weight(items, target_weight):
        # Prefer exact weight match, fall back to unknown weight (None)
        exact = next((i for i in items if i['classification'].get('weight') == target_weight), None)
        if exact:
            return exact
        return next((i for i in items if i['classification'].get('weight') is None), None)

    std_wt = standard_weight(commodity)
    r1 = _best_by_weight(rates1, std_wt) if std_wt else (rates1[0] if rates1 else None)
    r2 = _best_by_weight(rates2, std_wt) if std_wt else (rates2[0] if rates2 else None)

    if not r1 or not r2:
        return None

    d1_name = dealer_display(dealer1, _m)
    d2_name = dealer_display(dealer2, _m)

    lines = []
    purity_label = f' {purity}' if purity else ''
    weight_label = f"per {std_wt}" if std_wt else ""
    header_suffix = f" ({weight_label}, {format_ist_now()})" if weight_label else f" ({format_ist_now()})"
    lines.append(f"**{commodity}{purity_label} comparison**{header_suffix}")
    lines.append("")

    c1 = r1['classification']
    c2 = r2['classification']

    lines.append(f"| | {d1_name} | {d2_name} |")
    lines.append(f"|---|---|---|")

    buy1, buy2 = r1.get('buy_rate'), r2.get('buy_rate')
    sell1, sell2 = r1.get('sell_rate'), r2.get('sell_rate')

    lines.append(f"| Buy | {format_rate(buy1)} | {format_rate(buy2)} |")
    lines.append(f"| Sell | {format_rate(sell1)} | {format_rate(sell2)} |")

    if c1.get('purity') != c2.get('purity'):
        lines.append(f"| Purity | {c1.get('purity', '?')} | {c2.get('purity', '?')} |")

    # Always show GST and delivery so the user can judge comparability
    gst1 = c1.get('gst') or 'incl-GST'
    gst2 = c2.get('gst') or 'incl-GST'
    del1 = c1.get('delivery') or 'Spot'
    del2 = c2.get('delivery') or 'Spot'
    lines.append(f"| GST | {gst1} | {gst2} |")
    if del1 != 'Spot' or del2 != 'Spot':
        lines.append(f"| Delivery | {del1} | {del2} |")

    if sell1 and sell2 and sell1 > 0 and sell2 > 0:
        diff = sell1 - sell2
        if diff == 0:
            lines.append("")
            lines.append("Both dealers have identical sell rates.")
        else:
            cheaper_idx = 0 if diff < 0 else 1
            cheaper_name = d1_name if cheaper_idx == 0 else d2_name
            other_name = d2_name if cheaper_idx == 0 else d1_name
            cheaper_gst = gst1 if cheaper_idx == 0 else gst2
            other_gst = gst2 if cheaper_idx == 0 else gst1
            lines.append("")
            lines.append(f"**{cheaper_name}** is {format_rate(abs(diff))} cheaper to buy from (sell rate).")
            if cheaper_gst != other_gst:
                if cheaper_gst == 'ex-GST':
                    lines.append(f"_Note: {cheaper_name} is ex-GST — add applicable GST before comparing._")
                else:
                    lines.append(f"_Note: {other_name} is ex-GST — their all-inclusive price would be higher._")

    return '\n'.join(lines)


# ── Main entry point ──────────────────────────────────────────────────────────

async def try_fast_path(
    message: str,
    rate_service,
    session_id: Optional[str] = None,
) -> Optional[str]:
    """Attempt to answer the user's query without LLM.

    Returns formatted markdown response if handled, None if not.
    Conservative: only handles queries we're confident about.
    """
    # ── Cheap bail-outs first (no I/O) ────────────────────────────────

    lower = message.lower().strip()
    if len(lower) < 3 or len(lower) > 200:
        return None

    if re.match(r'^(hi|hello|hey|thanks|thank|bye|ok|okay|good|nice|help|what can you)\b', lower):
        return None
    if re.search(r'\b(news|alert|watchlist|add|create|set|remove|delete|save|calculate)\b', lower):
        return None

    entities = _extract_entities(message)

    intent = None
    intent_match = None
    for intent_name, pattern in INTENT_PATTERNS:
        m = pattern.search(message)
        if m:
            intent = intent_name
            intent_match = m
            break

    if not intent:
        return None

    # Intent-specific bail-outs (still no I/O)
    if intent == 'best_rate' and not entities.get('commodity'):
        return None

    # Don't fast-path follow-ups in existing conversations (1 Redis call)
    if session_id:
        from app.services.agent_session import AgentSessionService
        history = await AgentSessionService.load(session_id)
        if history and len(history) > 1:
            return None

    # ── Load data (only after all bail-outs pass) ─────────────────────

    try:
        current_rates = await rate_service.get_current_rates()
        try:
            (classified, _), meta = await asyncio.gather(
                get_cached_taxonomy(current_rates),
                load_dealer_metadata(),
            )
        except Exception:
            # Redis unavailable — compute in thread to avoid blocking event loop
            import copy
            safe_rates = copy.deepcopy(current_rates)
            classified = await asyncio.to_thread(classify_all_rates, safe_rates)
            meta = {}
    except Exception as e:
        logger.warning(f"Fast path taxonomy error: {e}")
        return None

    known_dealers = list(classified.keys())

    # ── Route to handler ──────────────────────────────────────────────

    if intent == 'best_rate':
        # commodity check already done above in bail-outs
        return _handle_best_rate(classified, entities, meta)

    elif intent == 'dealer_list':
        return _handle_dealer_list(classified, meta)

    elif intent == 'dealer_rates':
        groups = intent_match.groups()
        dealer_input = next((g for g in groups if g), None)
        if not dealer_input:
            return None
        # If the "dealer" is actually a commodity name, fall through to best_rate
        if dealer_input.lower() in COMMODITY_KEYWORDS:
            if entities.get('commodity'):
                return _handle_best_rate(classified, entities, meta)
            return None
        dealer_id = _resolve_dealer(dealer_input, known_dealers)
        if not dealer_id:
            return None
        return _handle_dealer_rates(classified, dealer_id, entities, meta)

    elif intent == 'compare':
        groups = intent_match.groups()
        d1_input = groups[0] or groups[2]
        d2_input = groups[1] or groups[3]
        if not d1_input or not d2_input:
            return None
        d1 = _resolve_dealer(d1_input, known_dealers)
        d2 = _resolve_dealer(d2_input, known_dealers)
        if not d1 or not d2:
            return None
        return _handle_compare(classified, d1, d2, entities, meta)

    return None
