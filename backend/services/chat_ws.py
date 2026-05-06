"""
chat_ws.py — In-process WebSocket connection manager for patient chat
sessions.

Patients and the assigned doctor each open a WebSocket subscribed to the
session id. After a REST handler commits a new message or a mode change,
it calls `broadcast(session_id, payload)` and every listener receives the
event without polling.

This is intentionally tiny — single process, no Redis. Production deploys
on a single FastAPI worker per region today, so a per-process registry is
sufficient. Swap for Redis pub/sub if we ever scale out.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ChatConnectionManager:
    def __init__(self) -> None:
        # session_id -> set of live WebSocket connections
        self._connections: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, session_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections.setdefault(session_id, set()).add(ws)
        logger.debug(
            f"WS connected session={session_id} "
            f"(total {len(self._connections.get(session_id, []))})"
        )

    async def disconnect(self, session_id: str, ws: WebSocket) -> None:
        async with self._lock:
            bucket = self._connections.get(session_id)
            if bucket is None:
                return
            bucket.discard(ws)
            if not bucket:
                self._connections.pop(session_id, None)
        logger.debug(f"WS disconnected session={session_id}")

    async def broadcast(self, session_id: str, payload: dict[str, Any]) -> None:
        """Send `payload` as JSON to every open socket on this session.

        Dead connections are removed silently — broadcast is best-effort.
        """
        async with self._lock:
            sockets = list(self._connections.get(session_id, []))
        if not sockets:
            return

        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception as exc:
                logger.debug(f"WS send failed, dropping: {exc}")
                dead.append(ws)

        if dead:
            async with self._lock:
                bucket = self._connections.get(session_id)
                if bucket:
                    for ws in dead:
                        bucket.discard(ws)
                    if not bucket:
                        self._connections.pop(session_id, None)


# Module-level singleton — every router imports the same instance.
chat_manager = ChatConnectionManager()
