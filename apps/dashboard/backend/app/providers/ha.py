"""Real Home Assistant provider.

Thin by design and interface-identical to the tested simulator. It cannot be
exercised until the HA instance exists (Phase 1/2) — flagged in the README.

  - snapshot: REST GET /api/states (filtered to configured entities)
  - short history (<=48h): REST /api/history/period with minimal_response
  - long history (>48h): WS recorder/statistics_during_period — hourly
    mean/min/max long-term statistics, which survive the 10-day recorder purge
  - live updates: WS subscribe_events state_changed, filtered, with
    exponential-backoff reconnect
"""

import asyncio
import json
import time
from datetime import datetime, timezone
from typing import Callable
from urllib.parse import quote

import httpx
import websockets

from ..config import AppConfig
from .base import StateEvent


def _parse_state(state: str) -> float | str | None:
    if state in ("unknown", "unavailable", ""):
        return None
    try:
        return float(state)
    except ValueError:
        return state  # binary sensors: "on"/"off"; text sensors pass through


def _iso_to_ts(iso: str) -> float:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


class HAProvider:
    def __init__(self, config: AppConfig, base_url: str, token: str) -> None:
        self.config = config
        self.base_url = base_url
        self.token = token
        self._callbacks: list[Callable[[StateEvent], None]] = []
        self._entities = set(config.all_entities)
        self._headers = {"Authorization": f"Bearer {token}"}
        self._ws_url = base_url.replace("http", "ws", 1) + "/api/websocket"
        self._msg_id = 0

    def subscribe(self, callback: Callable[[StateEvent], None]) -> None:
        self._callbacks.append(callback)

    async def snapshot(self) -> dict[str, StateEvent]:
        async with httpx.AsyncClient(headers=self._headers, timeout=10) as client:
            resp = await client.get(f"{self.base_url}/api/states")
            resp.raise_for_status()
        out: dict[str, StateEvent] = {}
        for row in resp.json():
            entity_id = row["entity_id"]
            if entity_id in self._entities:
                out[entity_id] = {
                    "entity_id": entity_id,
                    "value": _parse_state(row["state"]),
                    "ts": _iso_to_ts(row["last_updated"]),
                }
        return out

    async def history(
        self, entity_ids: list[str], hours: float, points: int
    ) -> tuple[dict[str, list[dict]], str]:
        if hours <= 48:
            return await self._recent_history(entity_ids, hours, points), "raw"
        return await self._statistics(entity_ids, hours), "stats"

    async def _recent_history(
        self, entity_ids: list[str], hours: float, points: int
    ) -> dict[str, list[dict]]:
        now = time.time()
        start = datetime.fromtimestamp(now - hours * 3600, tz=timezone.utc)
        end = datetime.fromtimestamp(now, tz=timezone.utc)
        # end_time is only optional in the sense that HA supplies a default, and
        # that default is start + 1 day — which silently truncates any window
        # longer than 24h. Left off, the 48h range came back covering -48h to
        # -24h and the chart ended on the previous day. quote() because the
        # "+00:00" offset would otherwise decode to a space in a query string.
        url = (
            f"{self.base_url}/api/history/period/{start.isoformat()}"
            f"?filter_entity_id={','.join(entity_ids)}"
            f"&end_time={quote(end.isoformat())}"
            f"&minimal_response&no_attributes"
        )
        async with httpx.AsyncClient(headers=self._headers, timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()
        series: dict[str, list[dict]] = {e: [] for e in entity_ids}
        for entity_rows in resp.json():
            if not entity_rows:
                continue
            entity_id = entity_rows[0]["entity_id"]
            # minimal_response only includes "last_updated" on the first row per
            # entity; subsequent rows carry "last_changed" instead (or omit both
            # if neither the state nor its update time actually changed).
            raw = []
            for r in entity_rows:
                ts = r.get("last_updated") or r.get("last_changed")
                if ts is None:
                    continue
                raw.append({"t": _iso_to_ts(ts), "v": _parse_state(r["state"])})
            series[entity_id] = _downsample(raw, points)
        return series

    async def _statistics(self, entity_ids: list[str], hours: float) -> dict[str, list[dict]]:
        start = datetime.fromtimestamp(time.time() - hours * 3600, tz=timezone.utc)
        result = await self._ws_command(
            {
                "type": "recorder/statistics_during_period",
                "start_time": start.isoformat(),
                "statistic_ids": entity_ids,
                "period": "hour",
                "types": ["mean", "min", "max"],
            }
        )
        series: dict[str, list[dict]] = {e: [] for e in entity_ids}
        for entity_id, rows in (result or {}).items():
            series[entity_id] = [
                {"t": r["start"] / 1000.0, "mean": r.get("mean"), "min": r.get("min"), "max": r.get("max")}
                for r in rows
            ]
        return series

    async def _ws_command(self, command: dict) -> dict | None:
        async with websockets.connect(self._ws_url) as ws:
            await self._ws_auth(ws)
            self._msg_id += 1
            await ws.send(json.dumps({"id": self._msg_id, **command}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get("id") == self._msg_id and msg.get("type") == "result":
                    return msg.get("result")

    async def _ws_auth(self, ws) -> None:
        await ws.recv()  # auth_required
        await ws.send(json.dumps({"type": "auth", "access_token": self.token}))
        reply = json.loads(await ws.recv())
        if reply.get("type") != "auth_ok":
            raise RuntimeError(f"HA WebSocket auth failed: {reply}")

    async def run(self) -> None:
        backoff = 1.0
        while True:
            try:
                async with websockets.connect(self._ws_url) as ws:
                    await self._ws_auth(ws)
                    self._msg_id += 1
                    await ws.send(
                        json.dumps(
                            {"id": self._msg_id, "type": "subscribe_events", "event_type": "state_changed"}
                        )
                    )
                    backoff = 1.0
                    async for raw in ws:
                        msg = json.loads(raw)
                        if msg.get("type") != "event":
                            continue
                        data = msg["event"]["data"]
                        entity_id = data.get("entity_id")
                        new_state = data.get("new_state")
                        if entity_id in self._entities and new_state:
                            event: StateEvent = {
                                "entity_id": entity_id,
                                "value": _parse_state(new_state["state"]),
                                "ts": _iso_to_ts(new_state["last_updated"]),
                            }
                            for cb in self._callbacks:
                                cb(event)
            except Exception:
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60.0)


def _downsample(rows: list[dict], points: int) -> list[dict]:
    """Bucketed mean so charts get <= ~points values regardless of raw density."""
    numeric = [r for r in rows if isinstance(r["v"], (int, float))]
    if len(numeric) <= points or not numeric:
        return numeric
    t0, t1 = numeric[0]["t"], numeric[-1]["t"]
    width = (t1 - t0) / points or 1.0
    buckets: dict[int, list[dict]] = {}
    for r in numeric:
        # The row at t == t1 would land in bucket `points`; clamp so the
        # output never exceeds the requested point count.
        buckets.setdefault(min(int((r["t"] - t0) / width), points - 1), []).append(r)
    return [
        {
            "t": sum(r["t"] for r in bucket) / len(bucket),
            "v": sum(r["v"] for r in bucket) / len(bucket),
        }
        for _, bucket in sorted(buckets.items())
    ]
