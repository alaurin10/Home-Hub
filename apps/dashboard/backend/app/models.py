"""API response models."""

from pydantic import BaseModel


class MetricValue(BaseModel):
    value: float | None
    unit: str = ""
    ts: float | None = None  # unix seconds of last update


class NodeStatus(BaseModel):
    online: bool
    wifi_signal: float | None = None
    uptime: float | None = None       # seconds
    last_seen: float | None = None    # unix seconds
    esphome_version: str | None = None
    ip_address: str | None = None
    missing: list[str] = []           # configured entity_ids with no data in the snapshot


class RoomSnapshot(BaseModel):
    id: str
    name: str
    metrics: dict[str, MetricValue]
    node: NodeStatus


class FleetStatus(BaseModel):
    stale_nodes: list[str]
    problem: bool


class RoomsResponse(BaseModel):
    rooms: list[RoomSnapshot]
    fleet: FleetStatus


class HistoryPoint(BaseModel):
    t: float                          # unix seconds
    v: float | None = None            # short-range value
    mean: float | None = None         # long-range statistics
    min: float | None = None
    max: float | None = None


class HistoryResponse(BaseModel):
    series: dict[str, list[HistoryPoint]]  # entity_id -> points
    kind: str                              # "raw" | "stats"


class CardLayout(BaseModel):
    id: str
    size: str = "regular"             # "regular" | "wide"


class Layout(BaseModel):
    cards: list[CardLayout]
