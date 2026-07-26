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


def test_rooms_carry_scores_and_a_house_summary(tmp_path):
    with make_client(tmp_path) as client:
        data = client.get("/api/rooms").json()
        house = data["house"]
        assert 0 <= house["score"] <= 100
        assert house["band"] in ("excellent", "good", "fair", "poor")
        assert house["headline"] and house["advisory"]
        assert house["worst_room"] in {r["name"] for r in data["rooms"]}
        for room in data["rooms"]:
            score = room["score"]
            assert 0 <= score["value"] <= 100
            # The parts are what the Settings tab renders — they must be there.
            assert {p["metric"] for p in score["parts"]} <= {
                "co2", "pm2_5", "voc", "temperature", "humidity"
            }
            assert all(p["detail"] for p in score["parts"])


def test_offline_room_has_no_score(tmp_path, monkeypatch):
    from app import settings

    monkeypatch.setattr(settings, "SIM_FAULT", "bedroom")
    with make_client(tmp_path) as client:
        data = client.get("/api/rooms").json()
        bedroom = next(r for r in data["rooms"] if r["id"] == "bedroom")
        # None, never a fabricated 100 from stale readings.
        assert bedroom["score"] is None
        assert next(r for r in data["rooms"] if r["id"] == "kitchen")["score"] is not None


def test_settings_default_is_blank(tmp_path):
    with make_client(tmp_path) as client:
        data = client.get("/api/settings").json()
        assert data == {
            "location": "",
            "scale": "F",
            "station": None,
            "latitude": None,
            "longitude": None,
            "timezone": None,
        }


def test_settings_roundtrip_and_persistence(tmp_path, monkeypatch):
    from app.providers import weather

    async def no_network(client, url, **kwargs):
        return None  # geocoding unavailable: the location still saves as typed

    monkeypatch.setattr(weather, "_get", no_network)
    with make_client(tmp_path) as client:
        saved = client.put("/api/settings", json={"location": "Cambridge, MA", "scale": "C"}).json()
        assert saved["location"] == "Cambridge, MA"
        assert saved["scale"] == "C"
        assert saved["latitude"] is None  # nothing matched, and it says so
    with make_client(tmp_path) as client:
        assert client.get("/api/settings").json()["location"] == "Cambridge, MA"


def test_settings_accepts_raw_coordinates(tmp_path):
    with make_client(tmp_path) as client:
        saved = client.put("/api/settings", json={"location": "42.3751,-71.1056"}).json()
        assert saved["latitude"] == 42.3751 and saved["longitude"] == -71.1056


def test_settings_rejects_an_unknown_scale(tmp_path):
    with make_client(tmp_path) as client:
        assert client.put("/api/settings", json={"location": "", "scale": "K"}).status_code == 400


def test_outdoor_204s_until_a_location_is_set(tmp_path):
    with make_client(tmp_path) as client:
        # No fabricated card, and no 500 — the UI prompts for a location.
        assert client.get("/api/outdoor").status_code == 204


def test_outdoor_serves_a_reading_once_located(tmp_path):
    with make_client(tmp_path) as client:
        client.put("/api/settings", json={"location": "42.3751,-71.1056"})
        data = client.get("/api/outdoor").json()
        assert data["temp"] is not None
        assert data["station"] and data["source"]
        assert [d["label"] for d in data["deltas"]][:2] == [
            "Indoor vs outdoor temp",
            "Indoor vs outdoor RH",
        ]
        assert all(0 <= d["fraction"] <= 1 for d in data["deltas"])
        assert data["ventilation"]["title"]


def test_insights_are_computed_at_startup(tmp_path):
    # The lifespan task runs its first pass immediately rather than after the
    # first 5-minute sleep, so a dashboard opened at boot is not blank.
    with make_client(tmp_path) as client:
        body = client.get("/api/insights").json()
        assert isinstance(body, list) and body
        assert {row["kind"] for row in body} <= {"action", "likely", "measured"}
        assert all(row["evidence"] for row in body)
