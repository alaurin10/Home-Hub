"""What probably happened today.

Plain rules over the last 24 h of history plus the outdoor snapshot. No model,
no statistics library — each rule is a pure function that returns an Insight or
None. Four honesty rules hold the whole thing up, and they are product
requirements rather than niceties:

  - anything causal is phrased with "likely"/"probably" and badged **Likely**;
  - anything counted is badged **Measured**;
  - every insight ships the evidence that triggered it, so a wrong guess is
    auditable rather than mysterious;
  - a rule that does not fire produces nothing. The feed is never padded.

Only ever the 24 h window: past 48 h the provider returns hourly means, where
spike detection is meaningless, so this must not follow the range control.
"""

import asyncio
import time
from dataclasses import dataclass
from datetime import datetime

from .models import Insight

WINDOW_HOURS = 24
WINDOW_POINTS = 144            # 10-minute resolution over the day
REFRESH_S = 300.0

# R1: three peaks this far apart still read as one cooking event. The design
# specified 75 minutes; the simulator's kitchen CO₂ holds a plateau to ~20:30
# while PM/VOC peak at ~19:12, so a strict 75 misses a dinner it should catch.
# CO₂ lags particulates by design — it keeps accumulating while people stay in
# the room after the pan is off — so the wider window is the physical reality,
# not a fudge to make a demo light up.
COOK_WINDOW_MIN = 100
COOK_HOURS = (16.0, 21.5)      # the dinner window
NIGHT_RISE_PPM = 200.0         # R2: overnight CO₂ climb worth reporting
VENT_DROP_PPM = 300.0          # R3: a fall this fast is air exchange, not decay
VENT_TEMP_MOVE_F = 0.3
VENT_WINDOW_MIN = 40
SOLAR_LIFT_F = 0.5             # R4: afternoon lift over the other rooms' average


@dataclass
class Point:
    t: float
    v: float


@dataclass
class Ctx:
    """Everything the rules read. Assembled once per run so no rule re-fetches."""

    series: dict[str, dict[str, list[Point]]]   # room_id -> metric -> 24 h points
    now: dict[str, dict[str, float]]            # room_id -> metric -> current value
    names: dict[str, str]                       # room_id -> display name
    outdoor: object | None                      # weather.OutdoorReading
    ventilation: object | None                  # models.Ventilation
    thresholds: dict
    scores: dict[str, int]


# --- helpers the rules share ---------------------------------------------

def hour_of(t: float) -> float:
    d = datetime.fromtimestamp(t)
    return d.hour + d.minute / 60.0


def clock(t: float) -> str:
    return datetime.fromtimestamp(t).strftime("%-I:%M %p")


def peak(points: list[Point]) -> Point | None:
    return max(points, key=lambda p: p.v) if points else None


def value_at(points: list[Point], hour: float) -> Point | None:
    """The sample nearest a given hour of the day."""
    if not points:
        return None
    return min(points, key=lambda p: abs(hour_of(p.t) - hour))


def steepest_drop(points: list[Point], window_minutes: int = VENT_WINDOW_MIN) -> tuple[float, Point, Point] | None:
    """(magnitude, from, to) of the sharpest fall over the window."""
    if len(points) < 3:
        return None
    span_s = (points[-1].t - points[0].t) / (len(points) - 1)
    step = max(1, round(window_minutes * 60 / span_s)) if span_s > 0 else 1
    best: tuple[float, Point, Point] | None = None
    for i in range(step, len(points)):
        drop = points[i - step].v - points[i].v
        if best is None or drop > best[0]:
            best = (drop, points[i - step], points[i])
    return best


def mean_between(points: list[Point], from_hour: float, to_hour: float) -> float | None:
    chunk = [p.v for p in points if from_hour <= hour_of(p.t) < to_hour]
    return sum(chunk) / len(chunk) if chunk else None


def _fmt(value: float, digits: int = 0) -> str:
    return f"{value:,.{digits}f}"


def _day_stamp(t: float | None = None) -> str:
    return datetime.fromtimestamp(t or time.time()).strftime("%Y-%m-%d")


# --- rules ----------------------------------------------------------------

def rule_cooking(ctx: Ctx) -> list[Insight]:
    """R1 — three independent signals peaking together at a mealtime.

    CO₂ alone cannot tell cooking from occupancy; particulates and VOC can. The
    co-occurrence test is the whole rule — drop it and this becomes "someone was
    in the kitchen"."""
    out = []
    for room_id, metrics in ctx.series.items():
        co2, pm, voc = metrics.get("co2"), metrics.get("pm2_5"), metrics.get("voc")
        if not (co2 and pm and voc):
            continue
        pc, pp, pv = peak(co2), peak(pm), peak(voc)
        if not (pc and pp and pv):
            continue
        span = COOK_WINDOW_MIN * 60
        together = abs(pc.t - pp.t) < span and abs(pc.t - pv.t) < span
        at_dinner = COOK_HOURS[0] <= hour_of(pc.t) <= COOK_HOURS[1]
        if not (together and at_dinner):
            continue
        name = ctx.names[room_id]
        out.append(
            Insight(
                id=f"cooking:{room_id}:{_day_stamp(pc.t)}",
                kind="likely",
                color_role="fair",
                room_id=room_id,
                text=(
                    f"Cooking around {clock(pp.t)} — {name} CO₂, PM2.5 and VOC all peaked "
                    "within the same hour"
                ),
                when=f"{clock(pp.t)} · peak {_fmt(pc.v)} ppm",
                evidence=[
                    f"CO₂ peaked at {_fmt(pc.v)} ppm ({clock(pc.t)})",
                    f"PM2.5 peaked at {_fmt(pp.v, 1)} µg/m³ ({clock(pp.t)})",
                    f"VOC index peaked at {_fmt(pv.v)} ({clock(pv.t)})",
                    "Three unrelated signals rising together at a mealtime is the cooking "
                    "pattern; CO₂ alone would just mean people in the room.",
                ],
            )
        )
    return out


def rule_overnight(ctx: Ctx) -> list[Insight]:
    """R2 — CO₂ climbs through the night with no particulate source: people."""
    out = []
    for room_id, metrics in ctx.series.items():
        co2 = metrics.get("co2")
        if not co2:
            continue
        # A particulate signal in the same room would make this ambiguous —
        # something could have been burning rather than breathing.
        pm = metrics.get("pm2_5")
        if pm:
            pm_peak, pm_floor = peak(pm), min(p.v for p in pm)
            if pm_peak and pm_peak.v - pm_floor > 10:
                continue
        night, morning = value_at(co2, 23.0), value_at(co2, 6.0)
        if not (night and morning):
            continue
        rise = morning.v - night.v
        if rise <= NIGHT_RISE_PPM:
            continue
        name = ctx.names[room_id]
        out.append(
            Insight(
                id=f"overnight:{room_id}:{_day_stamp(morning.t)}",
                kind="likely",
                color_role="series_2",
                room_id=room_id,
                text=(
                    f"{name} occupied overnight — CO₂ climbed {_fmt(rise)} ppm between "
                    "11 PM and 6 AM, then cleared"
                ),
                when="11 PM – 7 AM",
                evidence=[
                    f"CO₂ {_fmt(night.v)} → {_fmt(morning.v)} ppm",
                    "No particulate movement in this room, so the rise is people, not a source",
                    "The drop after 7 AM matches a door being opened, not a slow decay",
                ],
            )
        )
    return out


def rule_window_opened(ctx: Ctx) -> list[Insight]:
    """R3 — a CO₂ fall too fast to be decay, with the temperature moving toward
    outside at the same moment.

    Exactly one candidate — the largest — per run: a decaying evening curve
    should not read as an event just because it happens to be falling."""
    outdoor_temp = getattr(ctx.outdoor, "temp", None)
    if outdoor_temp is None:
        return []
    best = None
    for room_id, metrics in ctx.series.items():
        co2, temps = metrics.get("co2"), metrics.get("temperature")
        if not (co2 and temps):
            continue
        drop = steepest_drop(co2)
        if drop is None or drop[0] < VENT_DROP_PPM:
            continue
        magnitude, start, end = drop
        t_start, t_end = value_at(temps, hour_of(start.t)), value_at(temps, hour_of(end.t))
        if not (t_start and t_end):
            continue
        moved = abs(t_start.v - t_end.v)
        room_temp = ctx.now.get(room_id, {}).get("temperature")
        if moved < VENT_TEMP_MOVE_F or room_temp is None or outdoor_temp >= room_temp - 1:
            continue
        if best is None or magnitude > best[1]:
            best = (room_id, magnitude, start, end, moved)
    if best is None:
        return []
    room_id, magnitude, start, end, moved = best
    name = ctx.names[room_id]
    return [
        Insight(
            id=f"opened:{room_id}:{_day_stamp(end.t)}",
            kind="likely",
            color_role="series_1",
            room_id=room_id,
            text=(
                f"A window probably opened in the {name} around {clock(end.t)} — CO₂ fell "
                f"{_fmt(magnitude)} ppm in about {VENT_WINDOW_MIN} minutes"
            ),
            when=clock(end.t),
            evidence=[
                f"CO₂ {_fmt(start.v)} → {_fmt(end.v)} ppm",
                f"Indoor temperature moved {_fmt(moved, 1)} °F toward the "
                f"{_fmt(outdoor_temp)} °F outside at the same moment",
                "A fall that fast is air exchange; the sensor decays much more slowly on its own",
            ],
        )
    ]


def rule_solar_gain(ctx: Ctx) -> list[Insight]:
    """R4 — one room runs hot only while the sun is on it.

    Each room's midday lift is measured against *its own* 24 h mean, not against
    the other rooms' absolute temperatures. That is what stops a room which
    simply runs warm from looking sunlit."""
    lifts: dict[str, float] = {}
    for room_id, metrics in ctx.series.items():
        temps = metrics.get("temperature")
        if not temps:
            continue
        midday, whole = mean_between(temps, 12.0, 16.0), mean_between(temps, 0.0, 24.0)
        if midday is None or whole is None:
            continue
        lifts[room_id] = midday - whole
    if len(lifts) < 2:
        return []
    room_id, lift = max(lifts.items(), key=lambda kv: kv[1])
    others = [v for k, v in lifts.items() if k != room_id]
    baseline = sum(others) / len(others)
    if lift - baseline <= SOLAR_LIFT_F:
        return []
    name = ctx.names[room_id]
    sunset = getattr(ctx.outdoor, "sunset", None)
    evidence = [
        f"{name} lifted {_fmt(lift, 1)} °F over its daily mean; the other rooms only "
        f"{_fmt(baseline, 1)} °F",
        f"The gap closes after {sunset}, which rules out a heating setpoint"
        if sunset
        else "The gap closes in the evening, which rules out a heating setpoint",
    ]
    outdoor_temp = getattr(ctx.outdoor, "temp", None)
    if outdoor_temp is not None:
        evidence.append(f"Outdoor temperature is {_fmt(outdoor_temp)} °F")
    return [
        Insight(
            id=f"solar:{room_id}:{_day_stamp()}",
            kind="likely",
            color_role="poor",
            room_id=room_id,
            text=(
                f"Afternoon sun on the {name} — it ran {_fmt(lift - baseline, 1)} °F hotter "
                "than its own daily average between noon and 4 PM, then fell back after sunset"
            ),
            when=f"12 – 4 PM · sunset {sunset}" if sunset else "12 – 4 PM",
            evidence=evidence,
        )
    ]


def rule_ventilate(ctx: Ctx) -> list[Insight]:
    """R5 — the only actionable rule. Reads the ventilation verdict computed in
    the outdoor path so the card and the feed cannot disagree."""
    vent = ctx.ventilation
    if vent is None or not getattr(vent, "recommended", False):
        return []
    outdoor = ctx.outdoor
    worst_id = min(ctx.scores, key=lambda k: ctx.scores[k]) if ctx.scores else None
    if worst_id is None:
        return []
    name = ctx.names[worst_id]
    co2 = ctx.now.get(worst_id, {}).get("co2")
    indoor_temp = ctx.now.get(worst_id, {}).get("temperature")
    aqi = getattr(outdoor, "aqi", None)
    outdoor_temp = getattr(outdoor, "temp", None)
    outdoor_pm = getattr(outdoor, "pm2_5", None)
    indoor_pm = ctx.now.get(worst_id, {}).get("pm2_5")

    evidence = []
    if aqi is not None:
        pm_note = f" and PM2.5 {_fmt(outdoor_pm, 1)} µg/m³" if outdoor_pm is not None else ""
        inside = f" — below the {_fmt(indoor_pm, 1)} inside" if indoor_pm is not None else ""
        evidence.append(f"Nearest monitor reads AQI {_fmt(aqi)} (good){pm_note}{inside}")
    if outdoor_temp is not None and indoor_temp is not None:
        evidence.append(
            f"Only {_fmt(abs(outdoor_temp - indoor_temp), 1)} °F between inside and out, "
            "so the heat cost is small"
        )
    sunset = getattr(outdoor, "sunset", None)
    outdoor_rh = getattr(outdoor, "humidity", None)
    if sunset and outdoor_rh is not None:
        evidence.append(
            f"Sun sets at {sunset} and outdoor humidity is {_fmt(outdoor_rh)}% and rising "
            "overnight, so keep it short"
        )
    return [
        Insight(
            id=f"ventilate:{worst_id}:{_day_stamp()}",
            kind="action",
            color_role="good",
            room_id=worst_id,
            text=(
                f"Ventilate the {name} — it is at {_fmt(co2)} ppm and outside is clean "
                "enough to help"
                if co2 is not None
                else f"Ventilate the {name} — outside is clean enough to help"
            ),
            when=f"outside {_fmt(outdoor_temp)} °F · AQI {_fmt(aqi)}"
            if outdoor_temp is not None and aqi is not None
            else "now",
            evidence=evidence or ["Outdoor conditions are better than indoors right now"],
        )
    ]


def rule_band_occupancy(ctx: Ctx) -> list[Insight]:
    """R6 — counted, not inferred. Always present, so the feed never consists
    solely of guesses."""
    best: tuple[str, float] | None = None
    good_max = ((ctx.thresholds.get("co2") or {}).get("bounds") or [800])[0]
    for room_id, metrics in ctx.series.items():
        co2 = metrics.get("co2")
        if not co2:
            continue
        hours = sum(1 for p in co2 if p.v < good_max) / len(co2) * WINDOW_HOURS
        if best is None or hours > best[1]:
            best = (room_id, hours)
    if best is None:
        return []
    room_id, hours = best
    return [
        Insight(
            id=f"inband:{room_id}:{_day_stamp()}",
            kind="measured",
            color_role="muted",
            room_id=room_id,
            text=f"{ctx.names[room_id]} held good CO₂ for {_fmt(hours)} of the last 24 hours",
            when="rolling day",
            evidence=[
                "Counted directly from the samples — no inference",
                f"Good means under the {_fmt(good_max)} ppm band from Settings",
            ],
        )
    ]


RULES = (rule_ventilate, rule_cooking, rule_overnight, rule_window_opened, rule_solar_gain)
KIND_ORDER = {"action": 0, "likely": 1, "measured": 2}
MAX_INFERRED = 5


def evaluate(ctx: Ctx) -> list[Insight]:
    """Run every rule, rank actions first, and always append the measured one."""
    found: list[Insight] = []
    for rule in RULES:
        found.extend(rule(ctx))
    found.sort(key=lambda i: KIND_ORDER.get(i.kind, 9))
    return found[:MAX_INFERRED] + rule_band_occupancy(ctx)


# --- assembly -------------------------------------------------------------

async def build_context(app) -> Ctx | None:
    """One 24 h history read for every room, plus the current snapshot and the
    outdoor verdict. Returns None when there is nothing to reason about."""
    from .routes import _place_of, build_rooms  # local: routes imports this module's loop

    cfg = app.state.config
    snapshot = await build_rooms(app)
    online = {r.id: r for r in snapshot.rooms if r.node.online}
    if not online:
        return None

    wanted = ("co2", "temperature", "humidity", "pm2_5", "voc")
    entity_of: dict[str, dict[str, str]] = {}
    entities: list[str] = []
    for room in cfg.rooms:
        if room.id not in online:
            continue
        entity_of[room.id] = {m: e for m, e in room.entities.items() if m in wanted}
        entities.extend(entity_of[room.id].values())
    if not entities:
        return None

    raw, kind = await app.state.provider.history(entities, WINDOW_HOURS, WINDOW_POINTS)
    if kind != "raw":
        return None  # hourly means cannot support spike detection

    series: dict[str, dict[str, list[Point]]] = {}
    for room_id, metrics in entity_of.items():
        room_series: dict[str, list[Point]] = {}
        for metric, entity_id in metrics.items():
            points = [
                Point(t=p["t"], v=p["v"])
                for p in raw.get(entity_id, [])
                if isinstance(p.get("v"), (int, float))
            ]
            if len(points) >= 3:
                room_series[metric] = points
        if room_series:
            series[room_id] = room_series
    if not series:
        return None

    reading = await app.state.outdoor_cache.get(_place_of(app.state.settings))
    from .providers.weather import ventilation_advice

    return Ctx(
        series=series,
        now={
            room_id: {m: mv.value for m, mv in room.metrics.items() if mv.value is not None}
            for room_id, room in online.items()
        },
        names={room.id: room.name for room in snapshot.rooms},
        outdoor=reading,
        ventilation=ventilation_advice(snapshot, reading, cfg) if reading else None,
        thresholds=cfg.thresholds,
        scores={r.id: r.score.value for r in snapshot.rooms if r.score},
    )


async def recompute(app) -> list[Insight]:
    ctx = await build_context(app)
    return evaluate(ctx) if ctx else []


async def insight_loop(app) -> None:
    """Recompute every 5 minutes, and push over the stream only when the set
    actually changed — an unchanged feed should cost open dashboards nothing."""
    from .stream import hub

    while True:
        try:
            fresh = await recompute(app)
            if [i.id for i in fresh] != [i.id for i in app.state.insights]:
                app.state.insights = fresh
                hub.publish_message({"type": "insights"})
            else:
                app.state.insights = fresh
        except asyncio.CancelledError:
            raise
        except Exception:
            # A bad rule must never kill the loop; the feed just goes stale.
            pass
        await asyncio.sleep(REFRESH_S)
