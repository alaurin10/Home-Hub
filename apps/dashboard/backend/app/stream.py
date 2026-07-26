"""WebSocket fan-out hub: provider events in, every connected client out."""

import asyncio
import json
from typing import Any

from fastapi import WebSocket


class Hub:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self) -> None:
        self._loop = asyncio.get_running_loop()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._clients.discard(ws)

    def publish(self, event: dict[str, Any]) -> None:
        """Provider callback — safe to call from any async context."""
        self.publish_message({"type": "state", **event})

    def publish_message(self, message: dict[str, Any]) -> None:
        """Any typed message to every client. Non-state pushes (e.g. "insights
        changed, refetch") ride the same socket rather than opening a second."""
        if not self._clients or self._loop is None:
            return
        payload = json.dumps(message)
        for ws in list(self._clients):
            self._loop.create_task(self._send(ws, payload))

    async def _send(self, ws: WebSocket, message: str) -> None:
        try:
            await ws.send_text(message)
        except Exception:
            self.disconnect(ws)


hub = Hub()
