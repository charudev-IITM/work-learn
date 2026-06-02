"""
Goldie AI Agent — Orchestration service.

Owns the agentic loop: system prompt construction, multi-turn tool calling
via Groq (OpenAI-compatible API), SSE streaming, and query logging.
"""

import asyncio
import json
import os
import time
import uuid
import logging
from typing import AsyncGenerator, Optional

import httpx

from .agent_guardrails import (
    build_system_prompt, validate_input, validate_output, sanitize_llm_text,
    GuardrailError,
)
from .agent_credits import AgentCreditService, TOKENS_PER_CREDIT
from .agent_session import AgentSessionService
from .agent_tools import TOOL_DEFINITIONS, TOOL_REGISTRY, CONFIRMATION_TOOLS, execute_tool

logger = logging.getLogger(__name__)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
MODEL = os.getenv("GOLDIE_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
MAX_TOOL_ROUNDS = 5


def _sse_event(event_type: str, data: dict) -> str:
    """Format a single SSE event."""
    return f"data: {json.dumps({'type': event_type, 'data': data}, default=str)}\n\n"


class AgentService:

    def __init__(self):
        self._http: Optional[httpx.AsyncClient] = None
        self._api_key_set = False

    async def start(self) -> None:
        api_key = os.getenv("GROQ_API_KEY", "")
        if not api_key:
            logger.warning("GROQ_API_KEY not set — Goldie agent will be unavailable")
        else:
            self._api_key_set = True
        self._http = httpx.AsyncClient(
            base_url=GROQ_BASE_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(60.0, connect=10.0),
        )
        logger.info("Goldie agent service started (model=%s)", MODEL)

    async def stop(self) -> None:
        if self._http:
            await self._http.aclose()
            self._http = None
        logger.info("Goldie agent service stopped")

    async def stream_chat(
        self,
        user_id: str,
        plan_type: str,
        is_admin: bool,
        message: str,
        session_id: Optional[str],
        rate_service,
    ) -> AsyncGenerator[str, None]:
        """Core SSE generator. Yields SSE-formatted strings.

        Flow: validate → deduct credit → load session → LLM → tools → stream.
        """
        start_time = time.monotonic()
        token_emitted = False
        tools_called = []
        response_text = ""
        # Token accumulators (across all Groq rounds)
        total_input_tokens = 0
        total_output_tokens = 0

        # Generate or validate session_id
        if not session_id:
            session_id = AgentSessionService.new_session_id()

        # 1. Input guardrails
        try:
            message = validate_input(message)
        except GuardrailError as e:
            yield _sse_event("error", {"code": "GUARDRAIL", "message": str(e)})
            yield _sse_event("done", {"session_id": session_id, "credits_used": 0})
            return

        # 1b. Fast path — answer common queries without LLM (zero cost)
        try:
            from app.services.agent_fast_path import try_fast_path
            fast_response = await try_fast_path(message, rate_service, session_id)
            if fast_response:
                logger.info("Fast path handled: %s", message[:60])
                # Stream as delta events (same format as LLM output)
                yield _sse_event("delta", {"text": fast_response})
                # Save to session so follow-ups have context.
                # Fast path already loaded+checked session history (and bailed
                # out if it was a follow-up), so this is always a new/empty session.
                dealer_names = list(rate_service.current_rates.keys()) or None
                history = [{"role": "system", "content": build_system_prompt(dealer_names, None)}]
                history.append({"role": "user", "content": message})
                history.append({"role": "assistant", "content": fast_response})
                await AgentSessionService.save(session_id, history)
                yield _sse_event("done", {
                    "session_id": session_id,
                    "credits_used": 0,
                    "credits_remaining": None,  # Don't bother checking — no cost
                })
                # Log as fast-path query
                asyncio.create_task(self._log_query(
                    user_id, session_id, message, fast_response,
                    ["fast_path"], int((time.monotonic() - start_time) * 1000),
                    None, 0, 0, plan_type,
                ))
                return
        except Exception as e:
            logger.debug("Fast path error (falling through to LLM): %s", e)

        # 2. Balance check (post-pay: no deduction yet, just gate on cutoff)
        display_credits, is_blocked = await AgentCreditService.check_balance(user_id, plan_type, is_admin)
        if is_blocked:
            yield _sse_event("error", {
                "code": "INSUFFICIENT_CREDITS",
                "message": "You've used most of your SONA AI credits for today. They reset at midnight UTC. Come back tomorrow!",
            })
            yield _sse_event("done", {"session_id": session_id, "credits_used": 0, "credits_remaining": display_credits})
            return

        # 3. Load session history
        history = await AgentSessionService.load(session_id)
        if not history:
            # Enrich system prompt with live dealer/script knowledge
            dealer_names = None
            sample_scripts = None
            try:
                dealers = list(rate_service.current_rates.keys())
                if dealers:
                    dealer_names = dealers
                    # Collect unique script names across all dealers (sample)
                    scripts = set()
                    for d in dealers[:10]:
                        for sym_data in rate_service.current_rates.get(d, {}).values():
                            sn = sym_data.get("script_name")
                            if sn:
                                scripts.add(sn)
                    if scripts:
                        sample_scripts = sorted(scripts)
            except Exception:
                pass  # Non-critical — prompt works without enrichment
            history = [{"role": "system", "content": build_system_prompt(dealer_names, sample_scripts)}]

        # Add user message
        history.append({"role": "user", "content": message})

        # 4. Agentic tool-calling loop
        all_suggested_actions = []  # Accumulated from tools for post-response emission
        llm_done = False  # Flag to exit outer loop when LLM finishes
        try:
            for tool_round in range(MAX_TOOL_ROUNDS):
                if llm_done:
                    break
                round_had_text = False  # Track if text was emitted this round

                # Call Groq
                async for event in self._call_groq(history):
                    event_type = event.get("type")

                    if event_type == "delta":
                        token_emitted = True
                        round_had_text = True
                        response_text += event["text"]
                        yield _sse_event("delta", {"text": event["text"]})

                    elif event_type == "tool_calls":
                        # Accumulate token usage from this round
                        round_usage = event.get("usage", {})
                        total_input_tokens += round_usage.get("input", 0)
                        total_output_tokens += round_usage.get("output", 0)

                        # If the LLM output "planning" text before calling tools,
                        # tell the frontend to collapse it into a thinking block
                        if round_had_text:
                            yield _sse_event("collapse_thinking", {})
                        # Process tool calls
                        tool_calls_data = event["tool_calls"]
                        assistant_msg = event["assistant_message"]
                        history.append(assistant_msg)

                        for tc in tool_calls_data:
                            tool_name = tc["function"]["name"]
                            tools_called.append(tool_name)

                            yield _sse_event("tool_start", {
                                "name": tool_name,
                                "label": _tool_label(tool_name),
                            })

                            # Execute the tool
                            try:
                                args = json.loads(tc["function"]["arguments"])
                            except (json.JSONDecodeError, TypeError):
                                args = {}

                            result_json, pending_action, suggested_actions = await execute_tool(
                                tool_name, args, user_id, session_id, rate_service,
                            )
                            all_suggested_actions.extend(suggested_actions)

                            # Add tool result to history
                            history.append({
                                "role": "tool",
                                "tool_call_id": tc["id"],
                                "content": result_json,
                            })

                            yield _sse_event("tool_result", {
                                "name": tool_name,
                                "summary": _summarize_tool_result(result_json),
                            })

                            # Emit structured data for rich UI rendering
                            if tool_name == "search_news":
                                try:
                                    parsed = json.loads(result_json)
                                    if parsed.get("articles"):
                                        yield _sse_event("news_articles", {
                                            "articles": parsed["articles"],
                                        })
                                except Exception:
                                    pass

                            # If confirmation needed, emit pending_action
                            if pending_action:
                                yield _sse_event("pending_action", pending_action)

                        # Continue to next round (LLM will process tool results)
                        break  # break inner for, continue outer tool_round loop

                    elif event_type == "done":
                        # Accumulate token usage from this (final) round
                        round_usage = event.get("usage", {})
                        total_input_tokens += round_usage.get("input", 0)
                        total_output_tokens += round_usage.get("output", 0)

                        # LLM finished without tool calls — we're done
                        assistant_msg = event.get("assistant_message")
                        if assistant_msg:
                            history.append(assistant_msg)
                        llm_done = True
                        break

                    elif event_type == "error":
                        # Post-pay: no refund needed — we haven't charged yet
                        yield _sse_event("error", {"code": "LLM_ERROR", "message": event.get("message", "AI service error")})
                        yield _sse_event("done", {"session_id": session_id, "credits_used": 0})
                        return

                else:
                    # for-else: loop completed without break (no tool_calls, done already handled)
                    break

        except Exception as e:
            logger.error("Agent stream error: %s", e, exc_info=True)
            # Post-pay: no refund needed — deduction hasn't happened yet
            yield _sse_event("error", {"code": "INTERNAL_ERROR", "message": "Something went wrong. Please try again."})
            yield _sse_event("done", {"session_id": session_id, "credits_used": 0})
            asyncio.create_task(self._log_query(
                user_id, session_id, message, response_text, tools_called,
                int((time.monotonic() - start_time) * 1000), str(e),
                0, 0, plan_type,
            ))
            return

        # 5. Output guardrails
        if response_text:
            response_text = sanitize_llm_text(response_text)
            response_text = validate_output(response_text)

        # 6. Save session
        await AgentSessionService.save(session_id, history)

        # 7. Post-pay token deduction
        total_tokens = total_input_tokens + total_output_tokens
        credits_remaining = await AgentCreditService.deduct_tokens(
            user_id, plan_type, is_admin, total_tokens,
        )
        tpc = TOKENS_PER_CREDIT.get(plan_type, TOKENS_PER_CREDIT["monthly"])
        credits_used = round(total_tokens / tpc, 2) if not is_admin else 0.0

        # 8. Emit suggested actions (interactive cards — after LLM text, before done)
        for action in all_suggested_actions:
            yield _sse_event("suggested_action", action)

        # 9. Emit done
        latency_ms = int((time.monotonic() - start_time) * 1000)

        yield _sse_event("done", {
            "session_id": session_id,
            "credits_used": credits_used,
            "credits_remaining": credits_remaining,
        })

        # 10. Log query (fire-and-forget)
        asyncio.create_task(self._log_query(
            user_id, session_id, message, response_text, tools_called,
            latency_ms, None, total_input_tokens, total_output_tokens, plan_type,
        ))

    async def _call_groq(self, messages: list) -> AsyncGenerator[dict, None]:
        """Call Groq streaming API and yield parsed events.

        Yields dicts with type: "delta" | "tool_calls" | "done" | "error"
        Retries once on 429 (rate limit) with backoff.
        """
        if not self._http or not self._api_key_set:
            yield {"type": "error", "message": "SONA AI is not configured. Missing GROQ_API_KEY."}
            return

        payload = {
            "model": MODEL,
            "messages": messages,
            "tools": TOOL_DEFINITIONS,
            "stream": True,
            "stream_options": {"include_usage": True},
            "temperature": 0.3,
            "max_tokens": 2048,
        }

        max_retries = 2
        for attempt in range(max_retries):
            try:
                async with self._http.stream("POST", "/chat/completions", json=payload) as response:
                    if response.status_code == 429 and attempt < max_retries - 1:
                        body = await response.aread()
                        retry_after = min(float(response.headers.get("retry-after", "2")), 5.0)
                        logger.warning("Groq 429 rate limited, retrying in %.1fs (attempt %d)", retry_after, attempt + 1)
                        await asyncio.sleep(retry_after)
                        continue  # retry

                    if response.status_code != 200:
                        body = await response.aread()
                        logger.error("Groq API error %d: %s", response.status_code, body[:500])
                        yield {"type": "error", "message": f"AI service returned {response.status_code}"}
                        return

                    accumulated_content = ""
                    accumulated_tool_calls = {}  # index -> {id, function: {name, arguments}}
                    finish_reason = None
                    usage_data = None  # Token usage from Groq

                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break

                        try:
                            chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        # Capture usage — Groq sends via x_groq.usage or usage
                        if chunk.get("x_groq", {}).get("usage"):
                            usage_data = chunk["x_groq"]["usage"]
                        elif chunk.get("usage"):
                            usage_data = chunk["usage"]

                        choices = chunk.get("choices", [])
                        if not choices:
                            continue  # Usage-only chunk, already captured above

                        choice = choices[0]
                        delta = choice.get("delta", {})
                        finish_reason = choice.get("finish_reason") or finish_reason

                        # Accumulate content deltas
                        if delta.get("content"):
                            accumulated_content += delta["content"]
                            yield {"type": "delta", "text": delta["content"]}

                        # Accumulate tool call deltas
                        if delta.get("tool_calls"):
                            for tc_delta in delta["tool_calls"]:
                                idx = tc_delta.get("index", 0)
                                if idx not in accumulated_tool_calls:
                                    accumulated_tool_calls[idx] = {
                                        "id": tc_delta.get("id", f"call_{idx}"),
                                        "type": "function",
                                        "function": {"name": "", "arguments": ""},
                                    }
                                tc = accumulated_tool_calls[idx]
                                if tc_delta.get("id"):
                                    tc["id"] = tc_delta["id"]
                                fn = tc_delta.get("function", {})
                                if fn.get("name"):
                                    tc["function"]["name"] += fn["name"]
                                if fn.get("arguments"):
                                    tc["function"]["arguments"] += fn["arguments"]

                    # Normalize usage
                    normalized_usage = {
                        "input": usage_data.get("prompt_tokens", 0) if usage_data else 0,
                        "output": usage_data.get("completion_tokens", 0) if usage_data else 0,
                        "total": usage_data.get("total_tokens", 0) if usage_data else 0,
                    }

                    # After stream ends, emit appropriate event
                    if accumulated_tool_calls:
                        tool_calls_list = [accumulated_tool_calls[i] for i in sorted(accumulated_tool_calls)]
                        assistant_message = {
                            "role": "assistant",
                            "content": accumulated_content or None,
                            "tool_calls": tool_calls_list,
                        }
                        yield {
                            "type": "tool_calls",
                            "tool_calls": tool_calls_list,
                            "assistant_message": assistant_message,
                            "usage": normalized_usage,
                        }
                    else:
                        yield {
                            "type": "done",
                            "assistant_message": {
                                "role": "assistant",
                                "content": accumulated_content,
                            },
                            "usage": normalized_usage,
                        }
                    return  # Success — exit retry loop

            except httpx.TimeoutException:
                logger.error("Groq API timeout")
                yield {"type": "error", "message": "AI service timed out. Please try again."}
                return
            except httpx.ConnectError:
                logger.error("Groq API connection error")
                yield {"type": "error", "message": "Cannot reach AI service. Please try again later."}
                return
            except Exception as e:
                logger.error("Groq API unexpected error: %s", e, exc_info=True)
                yield {"type": "error", "message": "AI service error. Please try again."}
                return

    async def _log_query(
        self, user_id: str, session_id: str, message: str,
        response_text: str, tools_called: list, latency_ms: int,
        error: Optional[str],
        input_tokens: int = 0,
        output_tokens: int = 0,
        plan_type: str = "monthly",
    ) -> None:
        """Fire-and-forget query logging to PostgreSQL."""
        try:
            from app.database.connection import AsyncSessionLocal
            from app.database.models import AgentQueryLog

            total_tokens = input_tokens + output_tokens
            # Compute credits_used from tokens (for audit trail)
            credits_used = 0.0
            if not error and total_tokens > 0:
                tpc = TOKENS_PER_CREDIT.get(plan_type, TOKENS_PER_CREDIT["monthly"])
                credits_used = round(total_tokens / tpc, 2)

            log = AgentQueryLog(
                id=str(uuid.uuid4()),
                user_id=user_id,
                session_id=session_id,
                message=message,
                response_summary=response_text[:500] if response_text else None,
                tools_called=tools_called if tools_called else None,
                credits_used=credits_used,
                latency_ms=latency_ms,
                error=error,
                input_tokens=input_tokens or None,
                output_tokens=output_tokens or None,
                total_tokens=total_tokens or None,
            )
            async with AsyncSessionLocal() as session:
                session.add(log)
                await session.commit()
        except Exception as e:
            logger.warning("Failed to log agent query: %s", e)


def _tool_label(name: str) -> str:
    """Human-readable label for a tool call."""
    labels = {
        "get_best_rate": "Finding best rates...",
        "get_live_rates": "Looking up live rates...",
        "compare_dealers": "Comparing dealers...",
        "search_news": "Searching news...",
        "calculate_spread": "Calculating spread...",
        "create_alert": "Setting up alert...",
        "add_to_watchlist": "Preparing watchlist update...",
        "get_dealer_list": "Fetching dealer list...",
        "get_dealers_by_city": "Finding dealers in your city...",
        "save_calculation": "Saving calculation...",
    }
    return labels.get(name, f"Running {name}...")


def _summarize_tool_result(result_json: str) -> str:
    """Create a brief summary of a tool result for the UI."""
    try:
        data = json.loads(result_json)
        if "error" in data:
            return data["error"]
        if "best_buy" in data or "best_sell" in data:
            parts = []
            if "best_buy" in data:
                bb = data["best_buy"]
                parts.append(f"Buy: {bb.get('dealer')} ₹{bb.get('rate', 0):,.0f}")
            if "best_sell" in data:
                bs = data["best_sell"]
                parts.append(f"Sell: {bs.get('dealer')} ₹{bs.get('rate', 0):,.0f}")
            count = data.get("total_matches", 0)
            return f"{' · '.join(parts)} ({count} matches)"
        if "rates" in data and isinstance(data["rates"], list):
            return f"Found {len(data['rates'])} scripts for {data.get('dealer', 'dealer')}"
        if "articles" in data:
            return f"Found {len(data['articles'])} articles"
        if "city" in data and "dealers" in data:
            city = data.get("city", "")
            count = len(data.get("dealers", []))
            total = data.get("total_dealers", count)
            return f"Found {count} dealer{'s' if count != 1 else ''} in {city} (of {total} total)"
        if "dealers" in data:
            return f"{data.get('count', 0)} dealers tracked"
        if "comparison" in data:
            return f"Compared {len(data['comparison'])} dealers"
        if "spread_buy" in data or "spread_sell" in data:
            return f"Spread: Buy ₹{data.get('spread_buy', 'N/A')}, Sell ₹{data.get('spread_sell', 'N/A')}"
        if "status" in data and data["status"] == "pending_confirmation":
            return data.get("summary", "Action pending confirmation")
        if "status" in data and data["status"] == "created" and "alert_id" in data:
            return f"Alert created: {data.get('condition', '')}"
        if "status" in data and data["status"] == "created" and "formula_id" in data:
            return f"Calculation saved: {data.get('name', '')}"
        return result_json[:100]
    except Exception:
        return result_json[:100]


# Module-level singleton
agent_service = AgentService()
