"""
Onboarding service: state management, rate catalog, auto-watchlist creation.
"""

import json
import logging
from datetime import datetime
from statistics import median
from typing import Dict, List, Optional

from sqlalchemy import select

from app.database.connection import AsyncSessionLocal, redis_manager
from app.database.models import DealerMetadata, OnboardingEvent, UserWatchlist, UserWatchlistScript, User
from app.schemas.onboarding import (
    OnboardingStateResponse,
    CatalogResponse,
    CatalogCommodity,
    CatalogDealer,
    CatalogScript,
    CreateWatchlistResponse,
    PreviewScriptInfo,
    WatchlistSuggestion,
    WatchlistSuggestionsResponse,
)
from app.schemas.watchlist import WatchlistCreate, WatchlistScriptCreate
from app.services.rate_taxonomy import get_cached_taxonomy
from app.services.agent_shared import filter_dealer_rates, standard_weight, load_dealer_metadata

logger = logging.getLogger(__name__)


# ── Constants ────────────────────────────────────────────────────────────────

STATE_KEY_PREFIX = "onboarding:state:"
CATALOG_CACHE_KEY_PREFIX = "onboarding:catalog:"

STATE_TTL = 604800       # 7 days
CATALOG_CACHE_TTL = 30   # 30 seconds

POPULAR_DEALERS = ["pjscommodities", "kjbullion", "shivsahai", "vipulgold", "amsbullion"]

MAX_SCRIPTS_PER_DEALER = 3
MAX_TOTAL_SCRIPTS = 30

# Market types to exclude from watchlist comparison (only spot rates are meaningful)
NON_SPOT_MARKET_TYPES = frozenset(('Futures', 'MCX', 'COMEX', 'Forex'))


def _strip_catalog_rates(response) -> None:
    """Nullify buy/sell rates in-place across all catalog scripts."""
    for commodity in response.commodities:
        for dealer in commodity.dealers:
            for script in dealer.scripts:
                script.buy_rate = None
                script.sell_rate = None


def _filter_scripts_by_attr(response: CatalogResponse, attr: str, allowed: List[str]) -> None:
    """Filter catalog scripts in-place, keeping only those where `attr` is in `allowed`."""
    lower = [v.lower() for v in allowed]
    for commodity in response.commodities:
        for dealer in commodity.dealers:
            dealer.scripts = [s for s in dealer.scripts if getattr(s, attr) and getattr(s, attr).lower() in lower]
            dealer.script_count = len(dealer.scripts)
        commodity.dealers = [d for d in commodity.dealers if d.scripts]
        commodity.dealer_count = len(commodity.dealers)
    response.commodities = [c for c in response.commodities if c.dealers]


def _safe_median(values: List[float]) -> float:
    """Return median of values, or 0.0 if empty."""
    return median(values) if values else 0.0


def _purity_score(purity: Optional[str]) -> int:
    """Rank purity for preference selection. Lower = preferred."""
    SCORES = {"999": 0, "9999": 1, "995": 2, "916": 3, "750": 4}
    return SCORES.get(purity or "", 10)


class OnboardingService:
    """Manages onboarding state, catalog, and watchlist creation."""

    # ── State Management (Redis) ─────────────────────────────────────────

    @staticmethod
    async def get_state(user_id: str) -> OnboardingStateResponse:
        """Get onboarding state from Redis."""
        try:
            raw = await redis_manager.get(f"{STATE_KEY_PREFIX}{user_id}")
            if raw:
                data = json.loads(raw)
                return OnboardingStateResponse(**data)
        except Exception as e:
            logger.warning(f"Failed to read onboarding state for {user_id}: {e}")
        return OnboardingStateResponse()

    @staticmethod
    async def upsert_state(
        user_id: str,
        step: str,
        commodities: Optional[List[str]] = None,
        dealer_ids: Optional[List[str]] = None,
    ) -> OnboardingStateResponse:
        """Upsert onboarding state in Redis."""
        key = f"{STATE_KEY_PREFIX}{user_id}"
        now = datetime.utcnow().isoformat()

        # Read existing
        existing = {}
        try:
            raw = await redis_manager.get(key)
            if raw:
                existing = json.loads(raw)
        except Exception:
            pass

        # Merge
        existing["step"] = step
        existing["updated_at"] = now
        if "started_at" not in existing:
            existing["started_at"] = now
        if commodities is not None:
            existing["commodities"] = commodities
        if dealer_ids is not None:
            existing["dealer_ids"] = dealer_ids

        try:
            await redis_manager.set(key, json.dumps(existing), STATE_TTL)
        except Exception as e:
            logger.error(f"Failed to write onboarding state for {user_id}: {e}")

        return OnboardingStateResponse(**existing)

    @staticmethod
    async def delete_state(user_id: str):
        """Delete onboarding state from Redis."""
        try:
            await redis_manager.delete(f"{STATE_KEY_PREFIX}{user_id}")
        except Exception:
            pass

    # ── Analytics Events (PostgreSQL) ────────────────────────────────────

    @staticmethod
    async def record_event(
        user_id: str,
        step: str,
        event_type: str,
        metadata: Optional[dict] = None,
    ):
        """Record an onboarding analytics event."""
        try:
            async with AsyncSessionLocal() as session:
                event = OnboardingEvent(
                    user_id=user_id,
                    step=step,
                    event_type=event_type,
                    event_data=metadata,
                )
                session.add(event)
                await session.commit()
        except Exception as e:
            logger.warning(f"Failed to record onboarding event: {e}")

    # ── Rate Catalog ─────────────────────────────────────────────────────

    @staticmethod
    async def build_rate_catalog(
        include_rates: bool,
        commodity_filter: Optional[List[str]] = None,
        purity_filter: Optional[List[str]] = None,
        weight_filter: Optional[List[str]] = None,
    ) -> CatalogResponse:
        """Build the rate catalog from live data + dealer metadata.

        Uses taxonomy classification to determine commodity for each script.
        Two separate cache keys prevent cross-contamination between authorized
        and unauthorized responses.
        """

        # Cache key incorporates access level to prevent rate data leaking
        # to users without access via shared cache
        cache_key = f"{CATALOG_CACHE_KEY_PREFIX}{'full' if include_rates else 'structure'}"

        # Check cache first
        try:
            cached = await redis_manager.get(cache_key)
            if cached:
                data = json.loads(cached)
                response = CatalogResponse(**data)
                # Defense-in-depth: strip rates even from cached response
                if not include_rates:
                    _strip_catalog_rates(response)
                if commodity_filter:
                    response.commodities = [
                        c for c in response.commodities
                        if c.name.lower() in [f.lower() for f in commodity_filter]
                    ]
                if purity_filter:
                    _filter_scripts_by_attr(response, "purity", purity_filter)
                if weight_filter:
                    _filter_scripts_by_attr(response, "weight", weight_filter)
                return response
        except Exception:
            pass

        # Always fetch rates — needed to build catalog structure (dealer/script list).
        from app.main import cached_rate_service
        current_rates = dict(cached_rate_service.current_rates)

        # Classify all scripts via taxonomy
        classified, _ = await get_cached_taxonomy(current_rates)

        # Get dealer metadata from DB
        dealer_meta_map: Dict[str, DealerMetadata] = {}
        try:
            async with AsyncSessionLocal() as session:
                dealer_ids = list(current_rates.keys())
                if dealer_ids:
                    result = await session.execute(
                        select(DealerMetadata).where(
                            DealerMetadata.dealer_id.in_(dealer_ids)
                        )
                    )
                    for meta in result.scalars().all():
                        dealer_meta_map[meta.dealer_id] = meta
        except Exception as e:
            logger.warning(f"Failed to load dealer metadata: {e}")

        # Build taxonomy lookup: {dealer_id: {symbol: classification}}
        taxonomy_lookup: Dict[str, Dict[str, dict]] = {}
        for dealer_id, items in classified.items():
            taxonomy_lookup[dealer_id] = {
                item['symbol']: item['classification'] for item in items
            }

        # Build commodity → dealers → scripts structure
        commodity_dealers: Dict[str, Dict[str, CatalogDealer]] = {}

        for dealer_id, scripts in current_rates.items():
            if not scripts:
                continue

            meta = dealer_meta_map.get(dealer_id)
            display_name = (meta.name if meta and meta.name else
                           dealer_id.replace("_", " ").replace("-", " ").title())
            city = meta.city if meta else None
            logo_url = meta.logo_url if meta else None
            is_popular = dealer_id in POPULAR_DEALERS

            dealer_tax = taxonomy_lookup.get(dealer_id, {})

            for symbol, rate_data in scripts.items():
                script_name = rate_data.get("script_name", symbol)
                tax = dealer_tax.get(symbol, {})
                product_type = tax.get("commodity", "Other")
                # Skip non-dealer rates (reference, premium, placeholder, spread)
                if tax.get("rate_category", "dealer_rate") != "dealer_rate":
                    product_type = "Other"

                if product_type not in commodity_dealers:
                    commodity_dealers[product_type] = {}

                if dealer_id not in commodity_dealers[product_type]:
                    commodity_dealers[product_type][dealer_id] = CatalogDealer(
                        dealer_id=dealer_id,
                        display_name=display_name,
                        city=city,
                        logo_url=logo_url,
                        is_popular=is_popular,
                    )

                commodity_dealers[product_type][dealer_id].scripts.append(
                    CatalogScript(
                        symbol=symbol,
                        display_name=script_name,
                        product_type=product_type,
                        buy_rate=rate_data.get("buy_rate"),
                        sell_rate=rate_data.get("sell_rate"),
                        purity=tax.get("purity"),
                        weight=tax.get("weight"),
                    )
                )

        # Assemble response
        commodities = []
        all_dealer_ids = set()
        for commodity_name in ["Gold", "Silver", "Copper", "Platinum", "Other"]:
            dealers_map = commodity_dealers.get(commodity_name)
            if not dealers_map:
                continue
            dealers = list(dealers_map.values())
            for d in dealers:
                d.script_count = len(d.scripts)
                all_dealer_ids.add(d.dealer_id)
            # Sort: popular first (in POPULAR_DEALERS order), then alphabetical
            def _dealer_sort_key(d):
                if d.is_popular:
                    try:
                        return (0, POPULAR_DEALERS.index(d.dealer_id))
                    except ValueError:
                        return (0, len(POPULAR_DEALERS))
                return (1, d.display_name.lower())
            dealers.sort(key=_dealer_sort_key)
            commodities.append(CatalogCommodity(
                name=commodity_name,
                dealers=dealers,
                dealer_count=len(dealers),
            ))

        response = CatalogResponse(
            commodities=commodities,
            total_dealers=len(all_dealer_ids),
        )

        # Strip rates BEFORE caching when unauthorized — the structure cache
        # key must never contain rate values, even transiently in Redis.
        if not include_rates:
            _strip_catalog_rates(response)

        # Cache the catalog (keyed by access level)
        try:
            await redis_manager.set(
                cache_key,
                json.dumps(response.model_dump()),
                CATALOG_CACHE_TTL,
            )
        except Exception:
            pass

        # Apply filter if requested
        if commodity_filter:
            lower_filter = [f.lower() for f in commodity_filter]
            response.commodities = [
                c for c in response.commodities if c.name.lower() in lower_filter
            ]

        # Apply purity/weight filters (post-build, like commodity filter)
        if purity_filter:
            _filter_scripts_by_attr(response, "purity", purity_filter)
        if weight_filter:
            _filter_scripts_by_attr(response, "weight", weight_filter)

        return response

    # ── Auto-Watchlist Creation ──────────────────────────────────────────

    @staticmethod
    async def select_scripts_for_watchlist(
        current_rates: Dict,
        commodities: List[str],
        dealer_ids: List[str],
    ) -> List[WatchlistScriptCreate]:
        """Select comparable scripts for a watchlist using taxonomy classification.

        Strategy: Pick the SINGLE best commodity×canonical_type combination that
        covers the most dealers. This ensures diff mode shows meaningful
        dealer-vs-dealer comparison (same product, same weight, same purity).

        Uses the taxonomy service (rate_taxonomy.py) to classify scripts instead
        of keyword matching — correctly handles WinBull numeric IDs, RSBL coded
        names, and filters out reference rates (COMEX/MCX).
        """
        scripts: List[WatchlistScriptCreate] = []

        # Classify all scripts via taxonomy
        classified, _ = await get_cached_taxonomy(current_rates)

        # canonical_type → list of {item, dealer_id, commodity}
        type_candidates: Dict[str, List[dict]] = {}

        for commodity in commodities:
            std_wt = standard_weight(commodity)
            for dealer_id in dealer_ids:
                items = classified.get(dealer_id, [])
                if not items:
                    continue

                # Filter to dealer_rate items of correct commodity + standard weight
                filtered = filter_dealer_rates(items, commodity=commodity, std_weight=std_wt)

                for item in filtered:
                    c = item['classification']
                    # Skip futures/MCX — only spot rates for watchlist comparison
                    mt = c.get('market_type', 'Spot')
                    if mt in NON_SPOT_MARKET_TYPES:
                        continue
                    ct = item['canonical_type']
                    if ct not in type_candidates:
                        type_candidates[ct] = []
                    type_candidates[ct].append({
                        'item': item,
                        'dealer_id': dealer_id,
                        'commodity': commodity,
                    })

        if not type_candidates:
            return []

        # Pick dominant type: most unique dealers, prefer types with purity
        # (bare "Gold" canonical types are often MCX-mirror rates with identical prices)
        dominant_type = max(
            type_candidates.keys(),
            key=lambda ct: (
                len(set(c['dealer_id'] for c in type_candidates[ct])),
                1 if any(p in ct for p in ('999', '995', '916', '750', '9999')) else 0,
            ),
        )
        candidates = type_candidates[dominant_type]
        dominant_commodity = candidates[0]['commodity']

        # One script per dealer: pick by purity score, break ties by shortest script_name
        best_per_dealer: Dict[str, dict] = {}
        for entry in candidates:
            item = entry['item']
            dealer_id = entry['dealer_id']
            purity = item['classification'].get('purity')
            score = _purity_score(purity)
            name_len = len(item.get('script_name', ''))

            existing = best_per_dealer.get(dealer_id)
            if not existing:
                best_per_dealer[dealer_id] = {**entry, 'score': score, 'name_len': name_len}
            else:
                if score < existing['score'] or (score == existing['score'] and name_len < existing['name_len']):
                    best_per_dealer[dealer_id] = {**entry, 'score': score, 'name_len': name_len}

        selected = list(best_per_dealer.values())

        # Compute median buy rate and filter >5% outliers
        buy_rates = [
            e['item'].get('buy_rate') for e in selected
            if e['item'].get('buy_rate') and e['item']['buy_rate'] > 0
        ]
        if buy_rates:
            median = _safe_median(buy_rates)
            if median > 0:
                selected = [
                    e for e in selected
                    if not e['item'].get('buy_rate')
                    or e['item']['buy_rate'] <= 0
                    or abs(e['item']['buy_rate'] - median) / median <= 0.05
                ]

        # Sanity check: if max/min rate ratio exceeds 2x, re-cluster
        valid_rates = [
            e['item']['buy_rate'] for e in selected
            if e['item'].get('buy_rate') and e['item']['buy_rate'] > 0
        ]
        if len(valid_rates) >= 2:
            ratio = max(valid_rates) / min(valid_rates)
            if ratio > 2.0:
                median = _safe_median(valid_rates)
                selected = [
                    e for e in selected
                    if not e['item'].get('buy_rate')
                    or e['item']['buy_rate'] <= 0
                    or abs(e['item']['buy_rate'] - median) / median <= 0.10
                ]

        # Sort by purity score, then add
        selected.sort(key=lambda e: e['score'])

        for entry in selected:
            if len(scripts) >= MAX_TOTAL_SCRIPTS:
                break
            item = entry['item']
            scripts.append(WatchlistScriptCreate(
                dealer_name=entry['dealer_id'],
                script_name=item['symbol'],
                script_display_name=item['script_name'],
                product_type=dominant_commodity,
                multiplier=1.0,
                original_buy_rate=item.get('buy_rate'),
                original_sell_rate=item.get('sell_rate'),
                original_rates_timestamp=(
                    datetime.fromisoformat(item['timestamp'])
                    if item.get('timestamp') else None
                ),
            ))

        return scripts[:MAX_TOTAL_SCRIPTS]

    @staticmethod
    async def create_onboarding_watchlist(
        user_id: str,
        commodities: List[str],
        dealer_ids: List[str],
        include_rates: bool = True,
    ) -> CreateWatchlistResponse:
        """Create the user's first watchlist from onboarding selections.

        Service always fetches rates internally (needed for script selection
        algorithm), but strips buy_rate/sell_rate from the response when
        include_rates=False.
        """
        from app.services.watchlist_service import WatchlistService

        watchlist_service = WatchlistService()

        # Always fetch rates — needed for script selection algorithm
        from app.main import cached_rate_service
        current_rates = dict(cached_rate_service.current_rates)

        # Check if "My Watchlist" already exists (idempotent)
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(UserWatchlist).where(
                    UserWatchlist.user_id == user_id,
                    UserWatchlist.name == "My Watchlist",
                ).limit(1)
            )
            existing = result.scalar_one_or_none()

        if existing:
            watchlist_id = existing.id
            # Watchlist already exists (retry/idempotent) — don't re-add scripts
            script_creates = []
        else:
            watchlist = await watchlist_service.create_watchlist(
                user_id, WatchlistCreate(name="My Watchlist")
            )
            watchlist_id = watchlist.id

            # Select and add scripts only for new watchlists
            script_creates = await OnboardingService.select_scripts_for_watchlist(
                current_rates, commodities, dealer_ids
            )

            if script_creates:
                await watchlist_service.add_scripts_bulk(user_id, watchlist_id, script_creates)

        # Update onboarding state with watchlist_id
        await OnboardingService.upsert_state(
            user_id, "preview", dealer_ids=dealer_ids, commodities=commodities
        )
        # Update the watchlist_id in state
        try:
            key = f"{STATE_KEY_PREFIX}{user_id}"
            raw = await redis_manager.get(key)
            if raw:
                data = json.loads(raw)
                data["watchlist_id"] = watchlist_id
                await redis_manager.set(key, json.dumps(data), STATE_TTL)
        except Exception:
            pass

        # Start preview timer server-side (idempotent) — ensures timer exists
        # even if the client never calls POST /preview/start
        from app.services.preview_timer_service import PreviewTimerService
        await PreviewTimerService.start(user_id)

        # Build preview info — strip rates if not authorized
        preview_scripts = [
            PreviewScriptInfo(
                dealer_name=s.dealer_name,
                script_name=s.script_name,
                display_name=s.script_display_name or s.script_name,
                product_type=s.product_type,
                buy_rate=s.original_buy_rate if include_rates else None,
                sell_rate=s.original_sell_rate if include_rates else None,
            )
            for s in script_creates
        ]

        return CreateWatchlistResponse(
            watchlist_id=watchlist_id,
            scripts_added=len(script_creates),
            preview_scripts=preview_scripts,
        )

    # ── Complete Onboarding ──────────────────────────────────────────────

    @staticmethod
    async def mark_complete(user_id: str):
        """Mark onboarding as complete and clean up state."""
        from app.services.auth import _invalidate_user_cache

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).filter_by(id=user_id)
            )
            user = result.scalar_one_or_none()
            if user:
                user.onboarding_complete = True
                user.updated_at = datetime.utcnow()
                await session.commit()

        await _invalidate_user_cache(user_id)
        await OnboardingService.delete_state(user_id)

        # Clean up preview timer
        from app.services.preview_timer_service import PreviewTimerService
        await PreviewTimerService.delete(user_id)

    # ── Watchlist Suggestions ────────────────────────────────────────────

    @staticmethod
    async def generate_watchlist_suggestions(
        watchlist_id: str,
        user_id: str,
    ) -> WatchlistSuggestionsResponse:
        """Generate suggestion cards for a watchlist.

        Type A — Similar-priced nearby dealers (up to 5):
          Dealers NOT in the watchlist with the same canonical_type and
          buy_rate within 3% of the user's median.

        Type B — Different purities/products from same dealers (up to 3):
          Other canonical_types from dealers already in the watchlist.
        """
        # Verify watchlist belongs to user, then load scripts
        async with AsyncSessionLocal() as session:
            wl = await session.execute(
                select(UserWatchlist).where(
                    UserWatchlist.id == watchlist_id,
                    UserWatchlist.user_id == user_id,
                ).limit(1)
            )
            if not wl.scalar_one_or_none():
                return WatchlistSuggestionsResponse()

            result = await session.execute(
                select(UserWatchlistScript).where(
                    UserWatchlistScript.watchlist_id == watchlist_id,
                )
            )
            wl_scripts = result.scalars().all()

        if not wl_scripts:
            return WatchlistSuggestionsResponse()

        # Get current rates + taxonomy + dealer metadata (parallelize cache reads)
        import asyncio
        from app.main import cached_rate_service
        current_rates = dict(cached_rate_service.current_rates)
        (classified, _), meta = await asyncio.gather(
            get_cached_taxonomy(current_rates),
            load_dealer_metadata(),
        )

        # Determine watchlist's dealers and dominant commodity + canonical_type
        wl_dealer_ids = set(s.dealer_name for s in wl_scripts)
        wl_symbols = set((s.dealer_name, s.script_name) for s in wl_scripts)

        # Find canonical types of watchlist scripts via taxonomy
        wl_canonical_counts: Dict[str, int] = {}
        wl_commodity_counts: Dict[str, int] = {}
        wl_buy_rates: List[float] = []

        for s in wl_scripts:
            items = classified.get(s.dealer_name, [])
            for item in items:
                if item['symbol'] == s.script_name:
                    ct = item['canonical_type']
                    wl_canonical_counts[ct] = wl_canonical_counts.get(ct, 0) + 1
                    commodity = item['classification'].get('commodity', 'Unknown')
                    wl_commodity_counts[commodity] = wl_commodity_counts.get(commodity, 0) + 1
                    buy = item.get('buy_rate')
                    if buy and buy > 0:
                        wl_buy_rates.append(buy)
                    break

        if not wl_canonical_counts:
            return WatchlistSuggestionsResponse()

        dominant_ct = max(wl_canonical_counts, key=wl_canonical_counts.get)
        dominant_commodity = max(wl_commodity_counts, key=wl_commodity_counts.get)
        median_buy = _safe_median(wl_buy_rates) if wl_buy_rates else 0

        # Collect watchlist dealer cities for proximity sorting
        wl_cities = set()
        for did in wl_dealer_ids:
            city = (meta.get(did) or {}).get('city')
            if city:
                wl_cities.add(city.lower())

        std_wt = standard_weight(dominant_commodity)
        suggestions: List[WatchlistSuggestion] = []

        # ── Type A: Similar-priced dealers not in watchlist ──
        type_a: list = []
        for dealer_id, items in classified.items():
            if dealer_id in wl_dealer_ids:
                continue

            filtered = filter_dealer_rates(items, commodity=dominant_commodity, std_weight=std_wt)
            for item in filtered:
                if item['canonical_type'] != dominant_ct:
                    continue
                mt = item['classification'].get('market_type', 'Spot')
                if mt in NON_SPOT_MARKET_TYPES:
                    continue
                buy = item.get('buy_rate')
                if not buy or buy <= 0 or median_buy <= 0:
                    continue
                if abs(buy - median_buy) / median_buy > 0.03:
                    continue

                dealer_info = meta.get(dealer_id, {})
                dealer_name = dealer_info.get('name') or dealer_id
                dealer_city = (dealer_info.get('city') or '').lower()
                same_city = dealer_city in wl_cities if dealer_city else False

                type_a.append((
                    (not same_city, abs(buy - median_buy)),  # sort key
                    WatchlistSuggestion(
                        dealer_id=dealer_id,
                        dealer_display_name=dealer_name,
                        script_name=item['symbol'],
                        script_display_name=item['script_name'],
                        canonical_type=item['canonical_type'],
                        buy_rate=buy,
                        sell_rate=item.get('sell_rate'),
                        suggestion_type="similar_dealer",
                        reason=f"Similar {dominant_ct.replace('_', ' ')} rate",
                    ),
                ))
                break  # one per dealer

        # Sort and limit Type A
        type_a.sort(key=lambda t: t[0])
        suggestions.extend(s for _, s in type_a[:5])

        # ── Type B: Different products from same dealers ──
        type_b: List[WatchlistSuggestion] = []
        for dealer_id in wl_dealer_ids:
            items = classified.get(dealer_id, [])
            if not items:
                continue

            dealer_info = meta.get(dealer_id, {})
            dealer_name = dealer_info.get('name') or dealer_id

            # Find other canonical types this dealer has
            for item in items:
                c = item['classification']
                if c.get('rate_category') != 'dealer_rate':
                    continue
                mt = c.get('market_type', 'Spot')
                if mt in NON_SPOT_MARKET_TYPES:
                    continue
                ct = item['canonical_type']
                if ct == dominant_ct:
                    continue
                # Only suggest standard commodities
                commodity = c.get('commodity')
                if commodity not in ('Gold', 'Silver', 'Platinum'):
                    continue
                # Check standard weight
                sw = standard_weight(commodity)
                w = c.get('weight')
                if sw and w is not None and w != sw:
                    continue
                buy = item.get('buy_rate')
                if not buy or buy <= 0:
                    continue
                # Skip if already in watchlist
                if (dealer_id, item['symbol']) in wl_symbols:
                    continue

                type_b.append(WatchlistSuggestion(
                    dealer_id=dealer_id,
                    dealer_display_name=dealer_name,
                    script_name=item['symbol'],
                    script_display_name=item['script_name'],
                    canonical_type=ct,
                    buy_rate=buy,
                    sell_rate=item.get('sell_rate'),
                    suggestion_type="different_product",
                    reason=f"Also from {dealer_name}: {ct.replace('_', ' ')}",
                ))
                break  # one different product per dealer

        suggestions.extend(type_b[:3])

        return WatchlistSuggestionsResponse(
            suggestions=suggestions[:8],
            watchlist_commodity=dominant_commodity,
        )
