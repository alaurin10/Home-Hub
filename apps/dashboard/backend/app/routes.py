"""REST + WebSocket API surface. The frontend renders entirely from /api/config
plus live data — rooms and thresholds are config, not code."""

import json
import time

from fastapi import APIRouter, HTTPException, Query, Request, WebSocket, WebSocketDisconnect

from . import settings
from .config import build_effective_thresholds
from .models import (
    CardLayout,
    FleetStatus,
    HistoryResponse,
    Layout,
    MetricValue,
    NodeStatus,
    RoomsResponse,
    RoomSnapshot,
    ThresholdsUpdate,
)
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


@router.get("/rooms", response_model=RoomsResponse)
async def get_rooms(request: Request):
    cfg = request.app.state.config
    states = await request.app.state.provider.snapshot()
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
        rooms.append(
            RoomSnapshot(
                id=room.id,
                name=room.name,
                metrics=metrics,
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
    return RoomsResponse(rooms=rooms, fleet=FleetStatus(stale_nodes=stale, problem=bool(stale)))


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
