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


class ScorePartModel(BaseModel):
    metric: str
    label: str                        # "CO₂"
    detail: str                       # "1,140 ppm vs 800 target"
    penalty: float                    # 17.0


class RoomScore(BaseModel):
    value: int
    band: str                         # "excellent" | "good" | "fair" | "poor"
    parts: list[ScorePartModel]


class RoomSnapshot(BaseModel):
    id: str
    name: str
    metrics: dict[str, MetricValue]
    node: NodeStatus
    # None when the room reports nothing usable — an offline node renders its
    # offline state rather than a fabricated 100.
    score: RoomScore | None = None


class FleetStatus(BaseModel):
    stale_nodes: list[str]
    problem: bool


class HouseSummary(BaseModel):
    score: int
    band: str
    worst_room: str | None
    headline: str
    advisory: str


class RoomsResponse(BaseModel):
    rooms: list[RoomSnapshot]
    fleet: FleetStatus
    house: HouseSummary


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


class ThresholdsUpdate(BaseModel):
    # metric -> {ranges: {...}} or {bounds: [...]} — numeric shape only; units
    # are config-owned. Validated/merged by config.build_effective_thresholds.
    thresholds: dict[str, dict]


class Settings(BaseModel):
    """Household preferences. `location` and `scale` are user-owned; the rest is
    resolved server-side on save so a location that matched nothing is visible
    back in the UI rather than failing silently."""

    location: str = ""
    scale: str = "F"                  # display-only: "F" | "C"
    station: str | None = None        # "KBOS · 2.4 mi"
    latitude: float | None = None
    longitude: float | None = None


class OutdoorDelta(BaseModel):
    label: str
    text: str
    fraction: float                   # 0–1, the bar fill


class Ventilation(BaseModel):
    recommended: bool
    title: str
    body: str


class Outdoor(BaseModel):
    temp: float | None = None
    humidity: float | None = None
    aqi: float | None = None
    pm2_5: float | None = None
    wind: float | None = None
    wind_dir: str | None = None
    sunrise: str | None = None
    sunset: str | None = None
    station: str | None = None        # "KBOS · 2.4 mi"
    source: str = ""                  # human-readable provenance
    deltas: list[OutdoorDelta] = []
    ventilation: Ventilation | None = None


class Insight(BaseModel):
    id: str                           # stable, e.g. "cooking:kitchen:2026-07-25"
    kind: str                         # "action" | "likely" | "measured"
    text: str
    when: str
    evidence: list[str]
    room_id: str | None = None
    color_role: str                   # "good" | "fair" | "poor" | "series_1" | "series_2" | "muted"
