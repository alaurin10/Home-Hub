"""Simulator provider — realistic demo data so the app runs standalone before
any hardware exists (and doubles as the screenshot/dev harness forever).

Everything derives from a deterministic pure model `_value(entity_id, t)`:
history is the model evaluated backwards at the real ESPHome cadences
(60s SCD4x, 120s PM), live updates are the model evaluated forwards by a
5-second tick task. SIM_SEED makes screenshots reproducible.

Physical semantics mirror the repo's production config exactly:
  - dew point / absolute humidity use the Magnus constants from
    packages/comfort.yaml (17.62 / 243.12; 216.7 factor),
  - fleet staleness uses the 10-minute rule from packages/monitoring.yaml,
  - SIM_FAULT=<room-id> forces that node stale/offline for System-view demos.
"""

import asyncio
import hashlib
import math
import time
from datetime import datetime
from typing import Callable

from .. import settings
from ..config import AppConfig
from .base import StateEvent

# Per-room occupancy schedules: list of (start_hour, end_hour, co2_target_ppm).
# Outside any window the room decays toward the outdoor baseline.
CO2_BASELINE = 420.0
CO2_SCHEDULES: dict[str, list[tuple[float, float, float]]] = {
    "bedroom": [(23, 24, 1150.0), (0, 7, 1350.0)],
    "living": [(18, 23, 950.0)],
    "kitchen": [(7.5, 9, 800.0), (12, 13.5, 850.0), (18.5, 20.5, 900.0)],
}
# Kitchen cooking events: (start_hour, pm2_5_peak µg/m³, voc_peak_index).
COOKING_EVENTS = [(8.0, 45.0, 220.0), (12.5, 65.0, 260.0), (19.0, 140.0, 340.0)]
COOKING_TAU_H = 25.0 / 60.0  # PM decay time constant ≈ 25 min

TEMP_SETPOINTS = {"bedroom": 19.5, "living": 21.5, "kitchen": 21.0}
UPTIME_EPOCH = time.time() - 6 * 86400  # nodes "booted" 6 days ago


def _noise(entity_id: str, t: float, period: float, amplitude: float) -> float:
    """Deterministic smooth pseudo-noise: sum of two incommensurate sines with
    an entity-specific phase. Stable across history/live evaluation."""
    seed = int(hashlib.md5(f"{settings.SIM_SEED}:{entity_id}".encode()).hexdigest()[:8], 16)
    p1, p2 = seed % 6283 / 1000.0, seed % 9973 / 1000.0
    return amplitude * (
        0.6 * math.sin(2 * math.pi * t / period + p1)
        + 0.4 * math.sin(2 * math.pi * t / (period * 0.37) + p2)
    )


def _hour_of_day(t: float) -> float:
    dt = datetime.fromtimestamp(t)
    return dt.hour + dt.minute / 60.0 + dt.second / 3600.0


def _schedule_target(room: str, hod: float) -> float:
    for start, end, target in CO2_SCHEDULES.get(room, []):
        if start <= hod < end:
            return target
    return CO2_BASELINE


def _co2(room: str, entity_id: str, t: float) -> float:
    # First-order response toward the scheduled target: look back 3h in 5-min
    # steps and relax toward each step's target (τ_rise 40 min, τ_decay 80 min).
    value = CO2_BASELINE
    steps = 36
    dt_s = 300.0
    for i in range(steps, 0, -1):
        target = _schedule_target(room, _hour_of_day(t - i * dt_s))
        tau = 2400.0 if target > value else 4800.0
        value += (target - value) * (1 - math.exp(-dt_s / tau))
    return max(CO2_BASELINE, value + _noise(entity_id, t, 1800, 25.0))


def _cooking_intensity(hod: float) -> tuple[float, float]:
    """(pm2_5_addition, voc_addition) from the most recent cooking event."""
    pm, voc = 0.0, 0.0
    for start, pm_peak, voc_peak in COOKING_EVENTS:
        dt_h = hod - start
        if dt_h < 0:
            dt_h += 24.0
        # 12-min ramp up, then exponential decay
        if dt_h < 0.2:
            frac = dt_h / 0.2
            pm = max(pm, pm_peak * frac)
            voc = max(voc, voc_peak * frac)
        else:
            pm = max(pm, pm_peak * math.exp(-(dt_h - 0.2) / COOKING_TAU_H))
            voc = max(voc, voc_peak * math.exp(-(dt_h - 0.2) / (COOKING_TAU_H * 2.2)))
    return pm, voc


def _temperature(room: str, entity_id: str, t: float) -> float:
    hod = _hour_of_day(t)
    diurnal = 1.2 * math.sin(2 * math.pi * (hod - 9) / 24.0)
    cooking = 2.0 * (_cooking_intensity(hod)[0] / 140.0) if room == "kitchen" else 0.0
    return TEMP_SETPOINTS[room] + diurnal + cooking + _noise(entity_id, t, 5400, 0.3)


def _humidity(room: str, entity_id: str, t: float) -> float:
    hod = _hour_of_day(t)
    diurnal = -4.0 * math.sin(2 * math.pi * (hod - 9) / 24.0)  # anti-correlated w/ temp
    cooking = 10.0 * (_cooking_intensity(hod)[0] / 140.0) if room == "kitchen" else 0.0
    return min(75.0, max(25.0, 45.0 + diurnal + cooking + _noise(entity_id, t, 7200, 2.5)))


def _dew_point(temp_c: float, rh: float) -> float:
    # Magnus formula, exact constants from packages/comfort.yaml
    gamma = math.log(max(rh, 1.0) / 100.0) + (17.62 * temp_c) / (243.12 + temp_c)
    return (243.12 * gamma) / (17.62 - gamma)


def _absolute_humidity(temp_c: float, rh: float) -> float:
    svp = 6.112 * math.exp((17.62 * temp_c) / (243.12 + temp_c))
    return 216.7 * ((rh / 100.0) * svp) / (273.15 + temp_c)


class SimProvider:
    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self._callbacks: list[Callable[[StateEvent], None]] = []

    # -- model ------------------------------------------------------------

    def _value(self, entity_id: str, t: float) -> float | str | None:
        located = self.config.metric_for(entity_id)
        if located is not None:
            room, metric = located
            if settings.SIM_FAULT == room:
                return None
            if metric == "co2":
                return round(_co2(room, entity_id, t), 0)
            if metric == "temperature":
                return round(_temperature(room, entity_id, t), 1)
            if metric == "humidity":
                return round(_humidity(room, entity_id, t), 1)
            if metric == "dew_point":
                return round(_dew_point(_temperature(room, entity_id, t), _humidity(room, entity_id, t)), 1)
            if metric == "absolute_humidity":
                return round(_absolute_humidity(_temperature(room, entity_id, t), _humidity(room, entity_id, t)), 1)
            hod = _hour_of_day(t)
            pm, voc = _cooking_intensity(hod)
            if metric == "pm2_5":
                return round(max(0.0, 6.0 + pm + _noise(entity_id, t, 900, 1.5)), 1)
            if metric == "pm1_0":
                return round(max(0.0, 4.0 + pm * 0.7 + _noise(entity_id, t, 900, 1.0)), 1)
            if metric == "pm10":
                return round(max(0.0, 8.0 + pm * 1.3 + _noise(entity_id, t, 900, 2.0)), 1)
            if metric == "voc":
                return round(max(1.0, 100.0 + voc + _noise(entity_id, t, 1200, 12.0)), 0)
            if metric == "nox":
                return round(max(1.0, 1.0 + voc * 0.05 + abs(_noise(entity_id, t, 1200, 1.5))), 0)

        for room in self.config.rooms:
            if entity_id == room.node.get("status"):
                return "off" if settings.SIM_FAULT == room.id else "on"
            if entity_id == room.node.get("wifi_signal"):
                if settings.SIM_FAULT == room.id:
                    return None
                return round(-55.0 + _noise(entity_id, t, 3600, 8.0), 0)
            if entity_id == room.node.get("uptime"):
                if settings.SIM_FAULT == room.id:
                    return None
                return round(t - UPTIME_EPOCH, 0)

        # Fleet entities: same semantics as packages/monitoring.yaml
        if entity_id == self.config.fleet["stale_nodes"]:
            return settings.SIM_FAULT if settings.SIM_FAULT else ""
        if entity_id == self.config.fleet["problem"]:
            return "on" if settings.SIM_FAULT else "off"
        return None

    def _event(self, entity_id: str, t: float) -> StateEvent:
        # Stale node: freeze its timestamps 20 min in the past (>10-min rule)
        ts = t
        located = self.config.metric_for(entity_id)
        if located and settings.SIM_FAULT == located[0]:
            ts = t - 1200
        return {"entity_id": entity_id, "value": self._value(entity_id, t), "ts": ts}

    # -- Provider interface -------------------------------------------------

    def subscribe(self, callback: Callable[[StateEvent], None]) -> None:
        self._callbacks.append(callback)

    async def snapshot(self) -> dict[str, StateEvent]:
        now = time.time()
        return {e: self._event(e, now) for e in self.config.all_entities}

    async def history(
        self, entity_ids: list[str], hours: float, points: int
    ) -> tuple[dict[str, list[dict]], str]:
        now = time.time()
        start = now - hours * 3600
        if hours <= 48:
            step = max((now - start) / max(points, 2), 60.0)
            series = {
                e: [
                    {"t": t, "v": self._value(e, t)}
                    for t in _frange(start, now, step)
                ]
                for e in entity_ids
            }
            return series, "raw"
        # Long range: hourly mean/min/max (mirrors HA long-term statistics)
        series = {}
        for e in entity_ids:
            rows = []
            for t in _frange(start, now, 3600.0):
                sub = [self._value(e, t + off) for off in (0, 900, 1800, 2700)]
                vals = [v for v in sub if isinstance(v, (int, float))]
                if vals:
                    rows.append(
                        {"t": t, "mean": sum(vals) / len(vals), "min": min(vals), "max": max(vals)}
                    )
            series[e] = rows
        return series, "stats"

    async def run(self) -> None:
        while True:
            await asyncio.sleep(5)
            now = time.time()
            for entity_id in self.config.all_entities:
                event = self._event(entity_id, now)
                for cb in self._callbacks:
                    cb(event)


def _frange(start: float, stop: float, step: float):
    t = start
    while t <= stop:
        yield t
        t += step
