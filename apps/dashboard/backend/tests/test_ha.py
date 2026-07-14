"""HAProvider history parsing — the real HA minimal_response shape (only the
first row per entity carries last_updated; later rows carry last_changed)."""

import asyncio
from pathlib import Path

import httpx

from app.config import load_config
from app.providers.ha import HAProvider

CONFIG = load_config(Path(__file__).resolve().parent.parent.parent / "config.yaml")


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


def test_recent_history_uses_last_changed_fallback(monkeypatch):
    entity = "sensor.bedroom_air_co2"
    payload = [
        [
            {
                "entity_id": entity,
                "state": "600",
                "last_changed": "2026-07-14T20:00:00+00:00",
                "last_updated": "2026-07-14T20:00:00+00:00",
            },
            {"state": "610", "last_changed": "2026-07-14T20:01:00+00:00"},
            {"state": "615", "last_changed": "2026-07-14T20:02:00+00:00"},
        ]
    ]

    async def fake_get(self, url, *args, **kwargs):
        return _FakeResponse(payload)

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)

    provider = HAProvider(CONFIG, base_url="http://ha.local:8123", token="x")
    series = asyncio.run(provider._recent_history([entity], hours=3, points=100))

    assert [row["v"] for row in series[entity]] == [600.0, 610.0, 615.0]
