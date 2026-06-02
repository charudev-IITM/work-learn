from fastapi import WebSocket
from typing import Dict, Set
import asyncio
import json
import logging

from app.database.connection import redis_manager

logger = logging.getLogger(__name__)

# Broadcast chunk size to avoid overwhelming the event loop with 10K+ gathers
BROADCAST_CHUNK_SIZE = 500

# Redis key for tracking online users across all pods
ONLINE_USERS_KEY = "ws:online_users"
# Safety-net TTL: if all pods crash without cleanup, the set auto-expires
ONLINE_USERS_TTL = 7200  # 2 hours


class WebSocketManager:
    """Manages WebSocket connections for real-time updates.

    Each gunicorn/uvicorn worker maintains its own instance.  With Redis
    pub/sub, every worker receives rate updates and broadcasts to its
    own pool of WebSocket connections.
    """

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._user_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket):
        """Accept a new WebSocket connection"""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def register(self, websocket: WebSocket, user_id: str | None = None):
        """Register an already-accepted WebSocket connection"""
        self.active_connections.add(websocket)
        if user_id:
            was_new = user_id not in self._user_connections
            if was_new:
                self._user_connections[user_id] = set()
            self._user_connections[user_id].add(websocket)
            if was_new:
                asyncio.ensure_future(self._redis_track_user(user_id, online=True))
        logger.info(f"WebSocket registered. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket, user_id: str | None = None):
        """Remove a WebSocket connection"""
        self.active_connections.discard(websocket)
        removed_uids: list[str] = []
        if user_id and user_id in self._user_connections:
            self._user_connections[user_id].discard(websocket)
            if not self._user_connections[user_id]:
                del self._user_connections[user_id]
                removed_uids.append(user_id)
        else:
            for uid in list(self._user_connections):
                self._user_connections[uid].discard(websocket)
                if not self._user_connections[uid]:
                    del self._user_connections[uid]
                    removed_uids.append(uid)
        for uid in removed_uids:
            asyncio.ensure_future(self._redis_track_user(uid, online=False))
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    @property
    def connected_user_count(self) -> int:
        """Number of distinct authenticated users with active WebSocket connections."""
        return len(self._user_connections)

    async def _redis_track_user(self, user_id: str, online: bool):
        """Add/remove user from the global Redis online set. Best-effort."""
        if online:
            await redis_manager.sadd(ONLINE_USERS_KEY, user_id)
            # Refresh TTL on every add — acts as a safety net for pod crashes
            try:
                if redis_manager.async_redis_client:
                    await redis_manager.async_redis_client.expire(ONLINE_USERS_KEY, ONLINE_USERS_TTL)
            except Exception:
                pass
        else:
            await redis_manager.srem(ONLINE_USERS_KEY, user_id)

    async def global_online_count(self) -> int:
        """Count of distinct online users across ALL pods (from Redis set)."""
        count = await redis_manager.scard(ONLINE_USERS_KEY)
        if count > 0 or redis_manager.async_redis_client:
            return count
        # Fallback to local count when Redis is unavailable
        return len(self._user_connections)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        """Send a message to a specific WebSocket"""
        try:
            await websocket.send_text(message)
        except Exception as e:
            logger.error(f"Error sending personal message: {e}")
            self.disconnect(websocket)

    async def send_to_user(self, user_id: str, message_dict: dict):
        """Send a message to all WebSocket connections for a specific user."""
        connections = self._user_connections.get(user_id)
        if not connections:
            return
        text = json.dumps(message_dict)
        disconnected = []
        for ws in list(connections):
            try:
                await ws.send_text(text)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self.disconnect(ws, user_id)

    async def close_user_connections(self, user_id: str, code: int = 4007, reason: str = "Session invalidated"):
        """Close all WebSocket connections for a user."""
        connections = self._user_connections.get(user_id)
        if not connections:
            return
        for ws in list(connections):
            try:
                await ws.close(code=code, reason=reason)
            except Exception:
                pass
            self.disconnect(ws, user_id)

    async def broadcast(self, message: str):
        """Broadcast a message to all connected WebSockets with chunked sends."""
        if not self.active_connections:
            return

        connections = list(self.active_connections)
        disconnected = []

        # Process in chunks to avoid backpressure on large connection counts
        for i in range(0, len(connections), BROADCAST_CHUNK_SIZE):
            chunk = connections[i:i + BROADCAST_CHUNK_SIZE]
            results = await asyncio.gather(
                *[conn.send_text(message) for conn in chunk],
                return_exceptions=True
            )

            for conn, result in zip(chunk, results):
                if isinstance(result, Exception):
                    disconnected.append(conn)

        # Remove disconnected connections and clean up user mappings
        for conn in disconnected:
            self.disconnect(conn)

    async def broadcast_json(self, data: dict):
        """Broadcast JSON data to all connected WebSockets"""
        message = json.dumps(data)
        await self.broadcast(message)


# Global instance (used by middleware for send_to_user)
websocket_manager = WebSocketManager()
