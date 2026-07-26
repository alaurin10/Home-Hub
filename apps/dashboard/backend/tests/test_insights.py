"""Insight engine: does each rule fire on the pattern it claims to detect, and
— more importantly — stay quiet on the pattern it must not mistake for it.

The simulator is deterministic, so the rules that read real curves are tested
against it directly. The negative cases (a room that merely runs warm, dirty air
outside) use synthetic series, because the point of each is a shape the
simulator does not produce.
"""

import asyncio
import math
import os
import time
from pathlib import Path

import pytest

os.environ["DEMO_MODE"] = "1"

from fastapi.testclient import TestClient

from app import insights
from app.config import load_config
from app.insights import (
    Ctx,
    Point,
    evaluate,
    mean_between,
    peak,
    rule_band_occupancy,
    rule_solar_gain,
    rule_ventilate,
    steepest_drop,
    value_at,
)
from app.main import create_app
from app.models import Ventilation
from app.providers.weather import OutdoorReading

CONFIG = load_config(Path(__file__).resolve().parent.parent.parent / "config.yaml")
ALLOWED_KINDS = {"action", "likely", "measured"}


@pytest.fixture()
def app(tmp_path):
    from app import settings

    settings.DATA_DIR = tmp_path
    application = create_app()
    with TestClient(application):
        yield application


def sim_insights(app, outdoor=None, ventilation=None):
    """Insights over the simulator's real 24 h curves, optionally with an
    outdoor reading spliced in (the rules that need one cannot fire without)."""
    ctx = asyncio.run(insights.build_context(app))
    assert ctx is not None
    ctx.outdoor = outdoor
    ctx.ventilation = ventilation
    return evaluate(ctx)


# --- helpers --------------------------------------------------------------

def series(values: list[float], hours: float = 24.0, end: float | None = None) -> list[Point]:
    end = end or time.time()
    start = end - hours * 3600
    step = (end - start) / (len(values) - 1)
    return [Point(t=start + i * step, v=v) for i, v in enumerate(values)]


def diurnal(offset: float = 0.0, solar: float = 0.0, n: int = 144) -> list[Point]:
    """A day of temperature: shared diurnal shape, a per-room constant offset,
    and optionally a midday solar bump."""
    end = time.time()
    points = []
    for i in range(n):
        t = end - (n - 1 - i) * (24 * 3600 / (n - 1))
        hod = (t % 86400) / 3600.0
        value = 70.0 + offset + 2.0 * math.sin(2 * math.pi * (hod - 9) / 24.0)
        if solar:
            value += solar * math.exp(-0.5 * ((hod - 14.0) / 1.6) ** 2)
        points.append(Point(t=t, v=value))
    return points


def make_ctx(**kwargs) -> Ctx:
    base = dict(
        series={},
        now={},
        names={},
        outdoor=None,
        ventilation=None,
        thresholds=CONFIG.thresholds,
        scores={},
    )
    base.update(kwargs)
    return Ctx(**base)


# --- shared helpers -------------------------------------------------------

def test_peak_and_value_at():
    points = series([1.0, 5.0, 3.0, 9.0, 2.0])
    assert peak(points).v == 9.0
    assert peak([]) is None
    assert value_at(points, 12.0) in points


def test_steepest_drop_finds_the_sharpest_fall():
    points = series([1000.0] * 10 + [400.0] * 10, hours=24)
    magnitude, start, end = steepest_drop(points)
    assert magnitude > 0
    assert start.v > end.v


def test_mean_between_returns_none_for_an_empty_window():
    assert mean_between([], 12, 16) is None


# --- rules against the simulator -----------------------------------------

def test_cooking_fires_for_the_kitchen_in_the_dinner_window(app):
    found = [i for i in sim_insights(app) if i.id.startswith("cooking:")]
    assert len(found) == 1
    assert found[0].room_id == "kitchen"
    assert found[0].kind == "likely"
    # It must cite all three signals — the co-occurrence *is* the claim.
    joined = " ".join(found[0].evidence)
    assert "CO₂ peaked" in joined and "PM2.5 peaked" in joined and "VOC index peaked" in joined
    assert "probably" in found[0].text or "Cooking around" in found[0].text


def test_overnight_occupancy_fires_for_the_bedroom(app):
    found = [i for i in sim_insights(app) if i.id.startswith("overnight:")]
    assert [i.room_id for i in found] == ["bedroom"]
    assert "climbed" in found[0].text


def test_solar_gain_fires_for_the_living_room(app):
    found = [i for i in sim_insights(app) if i.id.startswith("solar:")]
    assert [i.room_id for i in found] == ["living"]


def test_window_opened_fires_at_most_once(app):
    # Needs an outdoor temperature below indoors for the air-exchange check.
    found = [
        i
        for i in sim_insights(app, outdoor=OutdoorReading(temp=55.0, aqi=22))
        if i.id.startswith("opened:")
    ]
    assert len(found) <= 1


def test_band_occupancy_is_always_present(app):
    found = [i for i in sim_insights(app) if i.kind == "measured"]
    assert len(found) == 1
    assert "no inference" in " ".join(found[0].evidence)


def test_every_insight_is_evidenced_and_well_kinded(app):
    for insight in sim_insights(app, outdoor=OutdoorReading(temp=55.0, aqi=22)):
        assert insight.kind in ALLOWED_KINDS
        assert insight.evidence, f"{insight.id} shipped no evidence"
        assert insight.id and insight.text and insight.when


def test_actions_rank_above_guesses(app):
    vent = Ventilation(recommended=True, title="Good time to open up", body="…")
    found = sim_insights(app, outdoor=OutdoorReading(temp=67.0, aqi=22, pm2_5=5.1), ventilation=vent)
    assert found[0].kind == "action"
    assert found[-1].kind == "measured"


# --- the negatives that matter -------------------------------------------

def test_solar_gain_ignores_a_room_that_simply_runs_warm():
    """The whole point of comparing each room against its own mean: three rooms
    with identical curves at different offsets is not solar gain."""
    ctx = make_ctx(
        series={
            "a": {"temperature": diurnal(offset=0)},
            "b": {"temperature": diurnal(offset=4)},   # runs 4 °F warmer, all day
            "c": {"temperature": diurnal(offset=-2)},
        },
        names={"a": "A", "b": "B", "c": "C"},
    )
    assert rule_solar_gain(ctx) == []


def test_solar_gain_fires_on_a_genuine_afternoon_bump():
    ctx = make_ctx(
        series={
            "a": {"temperature": diurnal(offset=0)},
            "b": {"temperature": diurnal(offset=4, solar=2.5)},
            "c": {"temperature": diurnal(offset=-2)},
        },
        names={"a": "A", "b": "B", "c": "C"},
    )
    found = rule_solar_gain(ctx)
    assert len(found) == 1 and found[0].room_id == "b"


def test_ventilate_does_not_fire_when_the_air_outside_is_dirty():
    ctx = make_ctx(
        now={"kitchen": {"co2": 1400.0, "temperature": 72.0}},
        names={"kitchen": "Kitchen"},
        scores={"kitchen": 60},
        outdoor=OutdoorReading(temp=67.0, aqi=120),
        # The outdoor path already declined; the rule must honour that verdict
        # rather than second-guessing it with its own arithmetic.
        ventilation=Ventilation(recommended=False, title="Keep the windows shut", body="…"),
    )
    assert rule_ventilate(ctx) == []


def test_ventilate_fires_on_the_shared_verdict():
    ctx = make_ctx(
        now={"kitchen": {"co2": 1400.0, "temperature": 72.0, "pm2_5": 18.0}},
        names={"kitchen": "Kitchen"},
        scores={"kitchen": 60, "bedroom": 95},
        outdoor=OutdoorReading(temp=67.0, aqi=22, pm2_5=5.1, humidity=59, sunset="8:22 PM"),
        ventilation=Ventilation(recommended=True, title="Good time to open up", body="…"),
    )
    found = rule_ventilate(ctx)
    assert len(found) == 1
    assert found[0].kind == "action" and found[0].room_id == "kitchen"
    assert "1,400 ppm" in found[0].text
    assert any("AQI 22" in e for e in found[0].evidence)


def test_no_rule_pads_the_feed():
    """Nothing but flat lines: only the measured rule may speak."""
    flat = series([600.0] * 60)
    ctx = make_ctx(
        series={"a": {"co2": flat, "temperature": series([70.0] * 60)}},
        now={"a": {"co2": 600.0, "temperature": 70.0}},
        names={"a": "A"},
        scores={"a": 100},
    )
    found = evaluate(ctx)
    assert [i.kind for i in found] == ["measured"]


def test_band_occupancy_counts_against_the_configured_band():
    half_good = series([600.0] * 30 + [1400.0] * 30)
    ctx = make_ctx(series={"a": {"co2": half_good}}, names={"a": "A"})
    found = rule_band_occupancy(ctx)
    assert len(found) == 1
    assert "12 of the last 24 hours" in found[0].text


def test_empty_context_yields_nothing():
    assert evaluate(make_ctx()) == []


# --- the API surface ------------------------------------------------------

def test_insights_endpoint_serves_the_cached_set(app):
    with TestClient(app) as client:
        app.state.insights = asyncio.run(insights.recompute(app))
        body = client.get("/api/insights").json()
        assert isinstance(body, list)
        for row in body:
            assert row["kind"] in ALLOWED_KINDS
            assert row["evidence"]
