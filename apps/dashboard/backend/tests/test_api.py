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
        assert {r["id"] for r in cfg["rooms"]} == {"office", "kitchen", "bedroom", "living"}
        assert "co2" in cfg["thresholds"]


def test_rooms_snapshot(tmp_path):
    with make_client(tmp_path) as client:
        data = client.get("/api/rooms").json()
        assert len(data["rooms"]) == 4
        kitchen = next(r for r in data["rooms"] if r["id"] == "kitchen")
        assert kitchen["metrics"]["co2"]["value"] > 0
        assert kitchen["metrics"]["pm2_5"]["unit"] == "µg/m³"
        assert kitchen["node"]["online"] is True
        assert data["fleet"]["problem"] is False


def test_history_short_and_long(tmp_path):
    with make_client(tmp_path) as client:
        short = client.get(
            "/api/history", params={"entities": "sensor.office_air_co2", "hours": 24}
        ).json()
        assert short["kind"] == "raw"
        assert len(short["series"]["sensor.office_air_co2"]) > 50

        long = client.get(
            "/api/history", params={"entities": "sensor.office_air_co2", "hours": 24 * 30}
        ).json()
        assert long["kind"] == "stats"
        assert len(long["series"]["sensor.office_air_co2"]) > 24 * 25


def test_history_rejects_unknown_entity(tmp_path):
    with make_client(tmp_path) as client:
        resp = client.get("/api/history", params={"entities": "sensor.nope", "hours": 24})
        assert resp.status_code == 400


def test_layout_roundtrip(tmp_path):
    with make_client(tmp_path) as client:
        default = client.get("/api/layout").json()
        assert [c["id"] for c in default["cards"]] == ["office", "kitchen", "bedroom", "living"]

        new = {"cards": [
            {"id": "kitchen", "size": "wide"},
            {"id": "office", "size": "regular"},
            {"id": "bedroom", "size": "regular"},
            {"id": "living", "size": "regular"},
        ]}
        assert client.put("/api/layout", json=new).status_code == 200
        saved = client.get("/api/layout").json()
        assert saved["cards"][0] == {"id": "kitchen", "size": "wide"}

        bad = {"cards": [{"id": "garage", "size": "regular"}]}
        assert client.put("/api/layout", json=bad).status_code == 400
