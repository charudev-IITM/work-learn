"""
Goldie AI Agent — Conversation session management via Redis.

Stores OpenAI-format message history per session with 1-hour idle TTL.
"""

import json
import uuid
import logging
from typing import List, Dict

from app.database.connection import redis_manager

logger = logging.getLogger(__name__)

SESSION_TTL = 3600  # 1 hour idle expiry
MAX_HISTORY_MESSAGES = 40  # ~20 user+assistant turn pairs


def _session_key(session_id: str) -> str:
    return f"goldie:session:{session_id}"


def _trim_to_safe_boundary(messages: List[Dict]) -> List[Dict]:
    """Trim messages while preserving complete turn groups.

    The slice `messages[-N:]` can orphan a `tool` result message whose
    preceding `assistant` message (with `tool_calls`) was trimmed.
    This violates the Groq/OpenAI API spec.

    Strategy: after slicing, scan forward to find the first `user` role
    message — this guarantees we start on a clean turn boundary where
    every `tool` result has its preceding `assistant` message.
    """
    if not messages:
        return messages

    # Keep system prompt (index 0) + tail
    system = messages[0] if messages[0].get("role") == "system" else None
    tail = messages[-(MAX_HISTORY_MESSAGES):] if len(messages) > MAX_HISTORY_MESSAGES + 1 else messages[1:] if system else messages

    # Find first safe boundary — a `user` message
    start = 0
    for i, msg in enumerate(tail):
        if msg.get("role") == "user":
            start = i
            break

    trimmed = tail[start:]
    if system:
        return [system] + trimmed
    return trimmed


class AgentSessionService:

    @staticmethod
    def new_session_id() -> str:
        return str(uuid.uuid4())

    @staticmethod
    async def load(session_id: str) -> List[Dict]:
        """Load conversation history from Redis. Returns [] if not found."""
        key = _session_key(session_id)
        raw = await redis_manager.get(key)
        if not raw:
            return []
        try:
            messages = json.loads(raw)
            return messages if isinstance(messages, list) else []
        except (json.JSONDecodeError, TypeError):
            return []

    @staticmethod
    async def save(session_id: str, messages: List[Dict]) -> None:
        """Save conversation history, trimming to MAX_HISTORY_MESSAGES."""
        if len(messages) > MAX_HISTORY_MESSAGES + 1:
            messages = _trim_to_safe_boundary(messages)

        key = _session_key(session_id)
        try:
            await redis_manager.set(key, json.dumps(messages, default=str), SESSION_TTL)
        except Exception as e:
            logger.warning("Failed to save session %s: %s", session_id, e)

    @staticmethod
    async def delete(session_id: str) -> None:
        """Delete a session."""
        await redis_manager.delete(_session_key(session_id))
