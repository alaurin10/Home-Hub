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
        if not self._clients or self._loop is None:
            return
        message = json.dumps({"type": "state", **event})
        for ws in list(self._clients):
            self._loop.create_task(self._send(ws, message))

    async def _send(self, ws: WebSocket, message: str) -> None:
        try:
            await ws.send_text(message)
        except Exception:
            self.disconnect(ws)


hub = Hub()
