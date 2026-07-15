"""Simulator smoke tests: physical bounds, diurnal shape, history continuity."""

import asyncio
import time
from pathlib import Path

import pytest

from app.config import load_config
from app.providers.sim import SimProvider, _c_to_f, _temperature

CONFIG = load_config(Path(__file__).resolve().parent.parent.parent / "config.yaml")


@pytest.fixture()
def sim() -> SimProvider:
    return SimProvider(CONFIG)


def test_snapshot_covers_all_entities(sim):
    states = asyncio.run(sim.snapshot())
    assert set(states) == set(CONFIG.all_entities)


def test_physical_bounds_over_a_day(sim):
    now = time.time()
    for offset_h in range(0, 24, 2):
        t = now - offset_h * 3600
        for room in CONFIG.rooms:
            co2 = sim._value(room.entities["co2"], t)
            temp = sim._value(room.entities["temperature"], t)
            rh = sim._value(room.entities["humidity"], t)
            assert 380 <= co2 <= 2500, f"{room.id} co2={co2}"
            assert 59 <= temp <= 86, f"{room.id} temp={temp}"  # 15-30°C in °F
            assert 20 <= rh <= 80, f"{room.id} rh={rh}"
        pm = sim._value("sensor.kitchen_air_pm2_5", t)
        assert 0 <= pm <= 250


def test_temperature_reported_in_fahrenheit(sim):
    # Model runs in Celsius internally; the room entities report °F to match
    # the real HA deployment (docs/09-roadmap.md unit-system decision).
    now = time.time()
    for room in CONFIG.rooms:
        reported = sim._value(room.entities["temperature"], now)
        expected = _c_to_f(_temperature(room.id, room.entities["temperature"], now))
        assert reported == round(expected, 1)


def test_dew_point_below_temperature(sim):
    now = time.time()
    for room in CONFIG.rooms:
        temp = sim._value(room.entities["temperature"], now)
        dew = sim._value(room.entities["dew_point"], now)
        assert dew < temp


def test_short_history_shape(sim):
    series, kind = asyncio.run(sim.history(["sensor.living_air_co2"], hours=24, points=288))
    rows = series["sensor.living_air_co2"]
    assert kind == "raw"
    assert 100 <= len(rows) <= 1500
    ts = [r["t"] for r in rows]
    assert ts == sorted(ts)
    assert all(isinstance(r["v"], float) for r in rows)


def test_long_history_is_hourly_stats(sim):
    series, kind = asyncio.run(sim.history(["sensor.living_air_co2"], hours=24 * 7, points=300))
    rows = series["sensor.living_air_co2"]
    assert kind == "stats"
    assert 24 * 6 <= len(rows) <= 24 * 7 + 2
    for r in rows[:10]:
        assert r["min"] <= r["mean"] <= r["max"]


def test_deterministic_model(sim):
    t = time.time() - 3600
    a = sim._value("sensor.living_air_co2", t)
    b = SimProvider(CONFIG)._value("sensor.living_air_co2", t)
    assert a == b
