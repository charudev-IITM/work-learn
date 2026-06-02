"""
Goldie AI Agent — Token-weighted credit management via Redis.

Credits are stored as scaled integers (×1000) in Redis for fractional
deduction without float precision issues. A balance of 87.5 credits
is stored as 87500.

Token-to-credit conversion:
  monthly: 1 credit = 1,000 tokens
  annual:  1 credit =   500 tokens

Budget calibration (Groq Llama 4 Scout at $0.11/M in, $0.34/M out):
  Monthly plan: 100 credits/day × 1,000 tokens = 100K tokens/day
  → 3M tokens/month ≈ ₹46/month (under ₹50 budget at ₹92/$1)

Cutoff: block new queries when displayed credits ≤ 5.
"""

import math
import logging
from datetime import datetime, timezone, timedelta

from app.database.connection import redis_manager

logger = logging.getLogger(__name__)

# Daily credit allowances per plan
DAILY_CREDITS = {
    "monthly": 100,
    "annual": 200,
}

# Tokens per credit — determines how fast credits deplete
TOKENS_PER_CREDIT = {
    "monthly": 1000,
    "annual": 500,
}

# Block new queries when displayed (floor) credits are at or below this
CREDIT_CUTOFF = 5

# Scale factor: Redis stores credits × SCALE to keep integer arithmetic
SCALE = 1000

# Lua: atomic deduction with built-in legacy migration.
# KEYS[1] = credit key
# ARGV[1] = initial_scaled  (DAILY_CREDITS[plan] * SCALE)
# ARGV[2] = ttl seconds
# ARGV[3] = deduction_scaled
# ARGV[4] = max_daily  (for legacy detection)
# Returns new balance_scaled (can go negative; caller floors at 0 for display).
# Note: This is a Redis Lua script executed server-side via EVAL — the
# standard Redis pattern for atomic multi-step operations, not Python eval().
_DEDUCT_SCALED_LUA = """
local key       = KEYS[1]
local init      = tonumber(ARGV[1])
local ttl       = tonumber(ARGV[2])
local deduct    = tonumber(ARGV[3])
local max_daily = tonumber(ARGV[4])

local cur = redis.call('GET', key)
if cur == false then
    local new = init - deduct
    redis.call('SET', key, new, 'EX', ttl)
    return new
end

local val = tonumber(cur)
-- Legacy migration: old system stored plain integers (e.g. 99 for 99 credits).
-- New system stores scaled values (x1000). Detect: 0 < val <= max_daily.
-- Invariant: max_daily (<=200) is always < SCALE (1000), so ranges never overlap.
if val > 0 and val <= max_daily then
    val = val * 1000
end

local new = val - deduct
redis.call('SET', key, new, 'EX', ttl)
return new
"""


def _credit_key(user_id: str) -> str:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"goldie:credits:{user_id}:{today}"


def _seconds_until_midnight() -> int:
    now = datetime.now(timezone.utc)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(int((tomorrow - now).total_seconds()), 1)


def _resets_at_iso() -> str:
    now = datetime.now(timezone.utc)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return tomorrow.isoformat()


def _scaled_to_display(balance_scaled: int) -> int:
    """Convert scaled balance to display integer (floor, min 0)."""
    return max(balance_scaled // SCALE, 0)


def _detect_and_migrate_legacy(raw_int: int, max_daily: int) -> int:
    """Detect legacy un-scaled values and convert them (read-only callers).

    Old system stored plain integers (e.g., 87 for 87 credits).
    New system stores scaled (87000 for 87 credits).
    A legacy value is always <= max_daily (e.g., ≤200) while even
    1 scaled credit is 1000.

    Invariant: max_daily must be < SCALE (1000) for detection to work.
    Currently max_daily is 200 (annual plan). If this ever changes,
    update the Lua script's migration logic too.
    """
    assert max_daily < SCALE, f"max_daily ({max_daily}) must be < SCALE ({SCALE}) for legacy detection"
    if 0 < raw_int <= max_daily:
        return raw_int * SCALE
    return raw_int


class AgentCreditService:

    @staticmethod
    async def get_status(user_id: str, plan_type: str, is_admin: bool) -> dict:
        """Return current credit balance and metadata."""
        total = DAILY_CREDITS.get(plan_type, DAILY_CREDITS["monthly"])

        if is_admin:
            return {
                "credits_remaining": 999,
                "credits_total": 999,
                "plan_type": "admin",
                "resets_at": _resets_at_iso(),
            }

        key = _credit_key(user_id)
        raw = await redis_manager.get(key)

        if raw is None:
            remaining = total
        else:
            balance_scaled = _detect_and_migrate_legacy(int(raw), total)
            remaining = _scaled_to_display(balance_scaled)

        return {
            "credits_remaining": remaining,
            "credits_total": total,
            "plan_type": plan_type,
            "resets_at": _resets_at_iso(),
        }

    @staticmethod
    async def check_balance(user_id: str, plan_type: str, is_admin: bool) -> tuple:
        """Check current balance without deducting.

        Returns (display_credits: int, is_blocked: bool).
        Blocked when display_credits <= CREDIT_CUTOFF.
        Admins are never blocked.
        """
        if is_admin:
            return 999, False

        total = DAILY_CREDITS.get(plan_type, DAILY_CREDITS["monthly"])
        key = _credit_key(user_id)
        raw = await redis_manager.get(key)

        if raw is None:
            display = total
        else:
            balance_scaled = _detect_and_migrate_legacy(int(raw), total)
            display = _scaled_to_display(balance_scaled)

        return display, display <= CREDIT_CUTOFF

    @staticmethod
    async def deduct_tokens(
        user_id: str,
        plan_type: str,
        is_admin: bool,
        total_tokens: int,
    ) -> int:
        """Deduct credits based on actual token usage (post-pay).

        Returns the new credit balance as a display integer (floor).
        Admins always return 999.
        """
        if is_admin:
            return 999

        if total_tokens <= 0:
            status = await AgentCreditService.get_status(user_id, plan_type, False)
            return status["credits_remaining"]

        total_daily = DAILY_CREDITS.get(plan_type, DAILY_CREDITS["monthly"])
        tpc = TOKENS_PER_CREDIT.get(plan_type, TOKENS_PER_CREDIT["monthly"])
        # ceil so even a tiny call costs something
        deduction_scaled = max(math.ceil(total_tokens / tpc * SCALE), 1)

        key = _credit_key(user_id)
        ttl = _seconds_until_midnight()

        client = redis_manager.async_redis_client
        if not client:
            logger.critical("Redis unavailable — cannot deduct tokens")
            return 0

        try:
            # Redis EVAL runs the Lua script atomically server-side.
            # Legacy migration is handled inside Lua to avoid GET+SET race.
            new_balance_scaled = int(await client.eval(  # noqa: S307 — Redis server-side Lua, not Python eval
                _DEDUCT_SCALED_LUA, 1, key,
                str(total_daily * SCALE), str(ttl), str(deduction_scaled), str(total_daily),
            ))
        except Exception as e:
            logger.error("Token deduction Lua error: %s", e)
            return 0

        display = _scaled_to_display(new_balance_scaled)
        credits_cost = deduction_scaled / SCALE
        logger.info(
            "Deducted %.1f credits (%d tokens, %s) for user %s → %d remaining",
            credits_cost, total_tokens, plan_type, user_id, display,
        )
        return display
