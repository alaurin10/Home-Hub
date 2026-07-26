"""REST + WebSocket API surface. The frontend renders entirely from /api/config
plus live data — rooms and thresholds are config, not code."""

import json
import time

from fastapi import APIRouter, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect

from . import settings
from .config import build_effective_thresholds
from .models import (
    CardLayout,
    FleetStatus,
    HistoryResponse,
    HouseSummary,
    Insight,
    Layout,
    MetricValue,
    NodeStatus,
    Outdoor,
    OutdoorDelta,
    RoomScore,
    RoomsResponse,
    RoomSnapshot,
    ScorePartModel,
    Settings,
    ThresholdsUpdate,
)
from .providers.weather import Place, geocode, ventilation_advice
from .score import band_for, house_summary, score_room
from .stream import hub

router = APIRouter(prefix="/api")

STALE_AFTER_S = 600  # same 10-minute rule as packages/monitoring.yaml


@router.get("/config")
async def get_config(request: Request):
    cfg = request.app.state.config
    return {
        "house_name": cfg.house_name,
        "rooms": [
            {
                "id": r.id,
                "name": r.name,
                "metrics": list(r.entities.keys()),
                "entities": r.entities,
                "node": r.node,
            }
            for r in cfg.rooms
        ],
        "thresholds": cfg.thresholds,
        "mode": "demo" if settings.DEMO_MODE else "ha",
    }


async def build_rooms(app) -> RoomsResponse:
    """The one place a room snapshot is assembled — /api/rooms, /api/outdoor and
    the insight task all read this so they can never disagree about what the
    house currently reads."""
    cfg = app.state.config
    states = await app.state.provider.snapshot()
    now = time.time()

    def metric_value(entity_id: str, metric: str) -> MetricValue:
        ev = states.get(entity_id) or {}
        value = ev.get("value")
        unit = cfg.thresholds.get(metric, {}).get("unit", "")
        if metric == "temperature":
            unit = "°F"
        elif metric in ("humidity",):
            unit = "%"
        elif metric == "dew_point":
            unit = "°F"
        elif metric == "absolute_humidity":
            unit = "g/m³"
        return MetricValue(
            value=value if isinstance(value, (int, float)) else None,
            unit=unit,
            ts=ev.get("ts"),
        )

    def entity_missing(entity_id: str) -> bool:
        # Absent from the snapshot (entity_id typo / not in HA) or present but
        # valueless (unavailable/unknown/disabled) — either way, no data.
        ev = states.get(entity_id)
        return ev is None or ev.get("value") is None

    rooms = []
    stale: list[str] = []
    scored: list[tuple[str, int, list]] = []
    for room in cfg.rooms:
        metrics = {m: metric_value(e, m) for m, e in room.entities.items()}
        status_ev = states.get(room.node["status"]) or {}
        wifi_ev = states.get(room.node["wifi_signal"]) or {}
        uptime_ev = states.get(room.node["uptime"]) or {}
        version_ev = states.get(room.node.get("esphome_version", "")) or {}
        ip_ev = states.get(room.node.get("ip_address", "")) or {}
        co2_ts = (metrics.get("co2") or MetricValue(value=None)).ts
        is_stale = co2_ts is None or (now - co2_ts) > STALE_AFTER_S
        online = status_ev.get("value") == "on" and not is_stale
        if not online:
            stale.append(room.id)
        # An offline node keeps score=None: its last-known readings are stale by
        # definition, and a stale 100 is worse than no number at all.
        result = score_room({m: mv.value for m, mv in metrics.items()}, cfg.thresholds, cfg.score)
        if online and result is not None:
            value, parts = result
            scored.append((room.name, value, parts))
            score = RoomScore(
                value=value,
                band=band_for(value, cfg.score),
                parts=[
                    ScorePartModel(
                        metric=p.metric, label=p.label, detail=p.detail, penalty=round(p.penalty, 1)
                    )
                    for p in parts
                ],
            )
        else:
            score = None
        rooms.append(
            RoomSnapshot(
                id=room.id,
                name=room.name,
                metrics=metrics,
                score=score,
                node=NodeStatus(
                    online=online,
                    wifi_signal=wifi_ev.get("value") if isinstance(wifi_ev.get("value"), (int, float)) else None,
                    uptime=uptime_ev.get("value") if isinstance(uptime_ev.get("value"), (int, float)) else None,
                    last_seen=co2_ts,
                    esphome_version=version_ev.get("value") if isinstance(version_ev.get("value"), str) else None,
                    ip_address=ip_ev.get("value") if isinstance(ip_ev.get("value"), str) else None,
                    missing=sorted(
                        e
                        for e in [*room.entities.values(), *room.node.values()]
                        if entity_missing(e)
                    ),
                ),
            )
        )
    return RoomsResponse(
        rooms=rooms,
        fleet=FleetStatus(stale_nodes=stale, problem=bool(stale)),
        house=HouseSummary(**house_summary(scored, cfg.thresholds, cfg.score)),
    )


@router.get("/rooms", response_model=RoomsResponse)
async def get_rooms(request: Request):
    return await build_rooms(request.app)


@router.get("/history", response_model=HistoryResponse)
async def get_history(
    request: Request,
    entities: str = Query(..., description="comma-separated entity_ids"),
    hours: float = Query(24, gt=0, le=2400),
    points: int = Query(288, gt=1, le=1000),
):
    cfg = request.app.state.config
    entity_ids = [e.strip() for e in entities.split(",") if e.strip()]
    known = set(cfg.all_entities)
    unknown = [e for e in entity_ids if e not in known]
    if unknown:
        raise HTTPException(400, f"unknown entities: {', '.join(unknown)}")
    series, kind = await request.app.state.provider.history(entity_ids, hours, points)
    return HistoryResponse(series=series, kind=kind)


def _default_size(room) -> str:
    # Sensor-rich rooms (particulates and more) get a wide card by default:
    # with three rooms in a two-column grid, one wide + two regular composes
    # a complete block instead of leaving a dangling card.
    return "wide" if "pm2_5" in room.entities else "regular"


@router.get("/layout", response_model=Layout)
async def get_layout(request: Request):
    cfg = request.app.state.config
    path = settings.DATA_DIR / "layout.json"
    if path.exists():
        saved = Layout(**json.loads(path.read_text(encoding="utf-8")))
        saved_ids = {c.id for c in saved.cards}
        # Rooms added to config.yaml after a layout was saved still show up
        cards = [c for c in saved.cards if c.id in {r.id for r in cfg.rooms}]
        cards += [
            CardLayout(id=r.id, size=_default_size(r)) for r in cfg.rooms if r.id not in saved_ids
        ]
        return Layout(cards=cards)
    return Layout(cards=[CardLayout(id=r.id, size=_default_size(r)) for r in cfg.rooms])


@router.put("/layout", response_model=Layout)
async def put_layout(request: Request, layout: Layout):
    cfg = request.app.state.config
    room_ids = {r.id for r in cfg.rooms}
    if {c.id for c in layout.cards} - room_ids:
        raise HTTPException(400, "layout contains unknown room ids")
    settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
    (settings.DATA_DIR / "layout.json").write_text(layout.model_dump_json(), encoding="utf-8")
    return layout


THRESHOLDS_FILE = "thresholds.json"


def load_threshold_overrides() -> dict:
    """Saved comfort-band overrides, or {} when the user hasn't tuned any.
    Called at startup (main) and by the PUT/GET handlers below."""
    path = settings.DATA_DIR / THRESHOLDS_FILE
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


@router.get("/thresholds")
async def get_thresholds(request: Request):
    # `thresholds` is what the UI paints with (defaults + overrides); `defaults`
    # lets the editor offer a per-metric "reset to default".
    return {
        "thresholds": request.app.state.config.thresholds,
        "defaults": request.app.state.default_thresholds,
    }


@router.put("/thresholds")
async def put_thresholds(request: Request, update: ThresholdsUpdate):
    defaults = request.app.state.default_thresholds
    try:
        effective = build_effective_thresholds(defaults, update.thresholds)
    except (ValueError, TypeError, KeyError) as exc:
        raise HTTPException(400, str(exc))
    # Persist only the numeric shape, so un-tuned metrics keep tracking
    # config.yaml even if its defaults change later.
    sanitized = {
        metric: ({"ranges": effective[metric]["ranges"]} if "ranges" in effective[metric]
                 else {"bounds": effective[metric]["bounds"]})
        for metric in update.thresholds
    }
    settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
    (settings.DATA_DIR / THRESHOLDS_FILE).write_text(json.dumps(sanitized), encoding="utf-8")
    request.app.state.config.thresholds = effective
    return {"thresholds": effective, "defaults": defaults}


SETTINGS_FILE = "settings.json"


def load_settings() -> Settings:
    """Household preferences, or the blank default. Called at startup and by the
    handlers below. A corrupt file must not break startup — it falls back to
    defaults and the user re-saves."""
    path = settings.DATA_DIR / SETTINGS_FILE
    if path.exists():
        try:
            return Settings(**json.loads(path.read_text(encoding="utf-8")))
        except (ValueError, TypeError):
            pass
    return Settings()


def _save_settings(value: Settings) -> None:
    settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
    (settings.DATA_DIR / SETTINGS_FILE).write_text(value.model_dump_json(), encoding="utf-8")


@router.get("/settings", response_model=Settings)
async def get_settings(request: Request):
    return request.app.state.settings


@router.put("/settings", response_model=Settings)
async def put_settings(request: Request, update: Settings):
    if update.scale not in ("F", "C"):
        raise HTTPException(400, "scale must be 'F' or 'C'")
    current: Settings = request.app.state.settings
    saved = Settings(location=update.location.strip(), scale=update.scale)
    if not saved.location:
        pass  # cleared: drop the resolved coordinates with it
    elif saved.location == current.location and current.latitude is not None:
        # Unchanged location keeps its resolution — no geocode call per save.
        saved.station, saved.latitude, saved.longitude = (
            current.station,
            current.latitude,
            current.longitude,
        )
    else:
        place = await geocode(saved.location)
        if place is not None:
            saved.latitude, saved.longitude = place.latitude, place.longitude
            saved.station = place.label
        # A location that resolved to nothing is saved as typed with no
        # coordinates, so the UI can show "couldn't match that" rather than
        # silently keeping the old place.
    request.app.state.settings = saved
    request.app.state.outdoor_cache.invalidate()
    _save_settings(saved)
    return saved


def _place_of(current: Settings) -> Place | None:
    if current.latitude is None or current.longitude is None:
        return None
    return Place(
        latitude=current.latitude,
        longitude=current.longitude,
        label=current.station or current.location,
    )


def _fraction(value: float, span: float) -> float:
    """A signed magnitude as a 0–1 bar fill, so the three delta rows are
    comparable at a glance without inventing precision."""
    return max(0.0, min(1.0, abs(value) / span))


@router.get("/outdoor", response_model=Outdoor)
async def get_outdoor(request: Request):
    place = _place_of(request.app.state.settings)
    reading = await request.app.state.outdoor_cache.get(place)
    if reading is None:
        # No location set, or nothing resolved/reachable. 204 rather than a
        # fabricated card — the UI prompts for a location instead.
        return Response(status_code=204)

    snapshot = await build_rooms(request.app)
    online = [r for r in snapshot.rooms if r.node.online]
    indoor_temps = [r.metrics["temperature"].value for r in online if r.metrics.get("temperature")]
    indoor_temps = [t for t in indoor_temps if t is not None]
    indoor_rh = [r.metrics["humidity"].value for r in online if r.metrics.get("humidity")]
    indoor_rh = [h for h in indoor_rh if h is not None]

    deltas: list[OutdoorDelta] = []
    mean_temp = sum(indoor_temps) / len(indoor_temps) if indoor_temps else None
    if reading.temp is not None and mean_temp is not None:
        diff = mean_temp - reading.temp
        deltas.append(
            OutdoorDelta(
                label="Indoor vs outdoor temp",
                text=f"{'+' if diff >= 0 else '−'}{abs(diff):.1f} °F inside",
                fraction=_fraction(diff, 20.0),
            )
        )
    mean_rh = sum(indoor_rh) / len(indoor_rh) if indoor_rh else None
    if reading.humidity is not None and mean_rh is not None:
        diff = mean_rh - reading.humidity
        deltas.append(
            OutdoorDelta(
                label="Indoor vs outdoor RH",
                text=f"{'+' if diff >= 0 else '−'}{abs(diff):.0f} % inside",
                fraction=_fraction(diff, 35.0),
            )
        )
    if reading.pm2_5 is not None:
        deltas.append(
            OutdoorDelta(
                label="Nearest monitor PM2.5",
                text=f"{reading.pm2_5:.1f} µg/m³",
                fraction=_fraction(reading.pm2_5, 35.0),
            )
        )

    return Outdoor(
        temp=reading.temp,
        humidity=reading.humidity,
        aqi=reading.aqi,
        pm2_5=reading.pm2_5,
        wind=reading.wind,
        wind_dir=reading.wind_dir,
        sunrise=reading.sunrise,
        sunset=reading.sunset,
        station=reading.station,
        source=reading.source,
        deltas=deltas,
        ventilation=ventilation_advice(snapshot, reading, request.app.state.config),
    )


@router.get("/insights", response_model=list[Insight])
async def get_insights(request: Request):
    return request.app.state.insights


@router.get("/health")
async def health():
    return {"mode": "demo" if settings.DEMO_MODE else "ha", "ok": True}


@router.websocket("/stream")
async def stream(ws: WebSocket):
    await hub.connect(ws)
    try:
        while True:
            await ws.receive_text()  # keepalive pings from the client
    except WebSocketDisconnect:
        hub.disconnect(ws)
