"""API smoke tests in demo mode."""

import os

os.environ["DEMO_MODE"] = "1"

from fastapi.testclient import TestClient

from app.main import create_app


def make_client(tmp_path) -> TestClient:
    from app import settings

    settings.DATA_DIR = tmp_path
    return TestClient(create_app())


def test_config_shape(tmp_path):
    with make_client(tmp_path) as client:
        cfg = client.get("/api/config").json()
        assert cfg["mode"] == "demo"
        assert {r["id"] for r in cfg["rooms"]} == {"kitchen", "bedroom", "living"}
        assert "co2" in cfg["thresholds"]
        assert cfg["thresholds"]["temperature"]["ranges"]["good"] == [67, 75]


def test_rooms_snapshot(tmp_path):
    with make_client(tmp_path) as client:
        data = client.get("/api/rooms").json()
        assert len(data["rooms"]) == 3
        kitchen = next(r for r in data["rooms"] if r["id"] == "kitchen")
        assert kitchen["metrics"]["co2"]["value"] > 0
        assert kitchen["metrics"]["pm2_5"]["unit"] == "µg/m³"
        assert kitchen["node"]["online"] is True
        assert kitchen["node"]["esphome_version"] == "2025.6.3"
        assert kitchen["node"]["ip_address"].startswith("192.168.1.")
        assert kitchen["node"]["missing"] == []
        assert data["fleet"]["problem"] is False


def test_missing_entities_diagnostic(tmp_path, monkeypatch):
    from app import settings

    monkeypatch.setattr(settings, "SIM_FAULT", "bedroom")
    with make_client(tmp_path) as client:
        data = client.get("/api/rooms").json()
        bedroom = next(r for r in data["rooms"] if r["id"] == "bedroom")
        assert bedroom["node"]["online"] is False
        assert "sensor.bedroom_air_co2" in bedroom["node"]["missing"]
        assert "sensor.bedroom_air_wifi_signal" in bedroom["node"]["missing"]
        kitchen = next(r for r in data["rooms"] if r["id"] == "kitchen")
        assert kitchen["node"]["missing"] == []


def test_history_short_and_long(tmp_path):
    with make_client(tmp_path) as client:
        short = client.get(
            "/api/history", params={"entities": "sensor.living_air_co2", "hours": 24}
        ).json()
        assert short["kind"] == "raw"
        assert len(short["series"]["sensor.living_air_co2"]) > 50

        long = client.get(
            "/api/history", params={"entities": "sensor.living_air_co2", "hours": 24 * 30}
        ).json()
        assert long["kind"] == "stats"
        assert len(long["series"]["sensor.living_air_co2"]) > 24 * 25


def test_history_rejects_unknown_entity(tmp_path):
    with make_client(tmp_path) as client:
        resp = client.get("/api/history", params={"entities": "sensor.nope", "hours": 24})
        assert resp.status_code == 400


def test_layout_roundtrip(tmp_path):
    with make_client(tmp_path) as client:
        default = client.get("/api/layout").json()
        assert [c["id"] for c in default["cards"]] == ["kitchen", "bedroom", "living"]

        new = {"cards": [
            {"id": "kitchen", "size": "wide"},
            {"id": "bedroom", "size": "regular"},
            {"id": "living", "size": "regular"},
        ]}
        assert client.put("/api/layout", json=new).status_code == 200
        saved = client.get("/api/layout").json()
        assert saved["cards"][0] == {"id": "kitchen", "size": "wide"}

        bad = {"cards": [{"id": "garage", "size": "regular"}]}
        assert client.put("/api/layout", json=bad).status_code == 400


def test_thresholds_get_exposes_defaults(tmp_path):
    with make_client(tmp_path) as client:
        data = client.get("/api/thresholds").json()
        assert data["thresholds"]["temperature"]["ranges"]["good"] == [67, 75]
        assert data["defaults"]["humidity"]["ranges"]["good"] == [35, 55]


def test_thresholds_override_roundtrip(tmp_path):
    with make_client(tmp_path) as client:
        new = {"thresholds": {"humidity": {"ranges": {"good": [40, 50], "fair": [35, 55], "poor": [30, 60]}}}}
        resp = client.put("/api/thresholds", json=new)
        assert resp.status_code == 200
        body = resp.json()
        # Effective picks up the override; the config-owned unit is preserved.
        assert body["thresholds"]["humidity"]["ranges"]["good"] == [40, 50]
        assert body["thresholds"]["humidity"]["unit"] == "%"
        # Defaults still report the pristine config value (for reset).
        assert body["defaults"]["humidity"]["ranges"]["good"] == [35, 55]
        # /api/config now serves the tuned bands, so the UI recolors.
        assert client.get("/api/config").json()["thresholds"]["humidity"]["ranges"]["good"] == [40, 50]


def test_thresholds_override_persists_across_restart(tmp_path):
    with make_client(tmp_path) as client:
        new = {"thresholds": {"temperature": {"ranges": {"good": [68, 74], "fair": [65, 77], "poor": [60, 82]}}}}
        assert client.put("/api/thresholds", json=new).status_code == 200
    # A fresh app instance (same DATA_DIR) reloads the saved override at startup.
    with make_client(tmp_path) as client:
        got = client.get("/api/thresholds").json()
        assert got["thresholds"]["temperature"]["ranges"]["good"] == [68, 74]


def test_thresholds_reject_non_nested_ranges(tmp_path):
    with make_client(tmp_path) as client:
        bad = {"thresholds": {"humidity": {"ranges": {"good": [30, 60], "fair": [35, 55], "poor": [40, 50]}}}}
        assert client.put("/api/thresholds", json=bad).status_code == 400


def test_thresholds_reject_unknown_metric(tmp_path):
    with make_client(tmp_path) as client:
        bad = {"thresholds": {"loudness": {"bounds": [1, 2, 3]}}}
        assert client.put("/api/thresholds", json=bad).status_code == 400


def test_thresholds_reject_wrong_shape(tmp_path):
    with make_client(tmp_path) as client:
        # temperature is band-shaped (ranges); bounds must be refused.
        bad = {"thresholds": {"temperature": {"bounds": [60, 70, 80]}}}
        assert client.put("/api/thresholds", json=bad).status_code == 400
