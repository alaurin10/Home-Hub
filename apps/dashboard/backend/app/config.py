"""Load and validate config.yaml into a simple registry the API serves and
both providers consume."""

from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class Room:
    id: str
    name: str
    entities: dict[str, str]          # metric -> entity_id
    node: dict[str, str]              # status/wifi_signal/uptime/esphome_version/ip_address -> entity_id


@dataclass
class AppConfig:
    house_name: str
    rooms: list[Room]
    fleet: dict[str, str]             # stale_nodes/problem -> entity_id
    thresholds: dict[str, dict]       # metric -> {bounds: [...], unit: str}
    _by_entity: dict[str, tuple[str, str]] = field(default_factory=dict)

    @property
    def all_entities(self) -> list[str]:
        out = []
        for room in self.rooms:
            out.extend(room.entities.values())
            out.extend(room.node.values())
        out.extend(self.fleet.values())
        return out

    def metric_for(self, entity_id: str) -> tuple[str, str] | None:
        """(room_id, metric) for a measurement entity, else None."""
        return self._by_entity.get(entity_id)


def _validate_threshold(metric: str, threshold: dict) -> None:
    """A threshold is EITHER monotonic (`bounds: [a, b, c]` ascending) OR
    band-shaped (`ranges: {good/fair/poor: [lo, hi]}` with nested windows)."""
    bounds, ranges = threshold.get("bounds"), threshold.get("ranges")
    if (bounds is None) == (ranges is None):
        raise ValueError(f"threshold '{metric}': set exactly one of 'bounds' or 'ranges'")
    if bounds is not None:
        if len(bounds) != 3 or sorted(bounds) != list(bounds):
            raise ValueError(f"threshold '{metric}': bounds must be 3 ascending numbers")
        return
    if set(ranges) != {"good", "fair", "poor"}:
        raise ValueError(f"threshold '{metric}': ranges needs good, fair and poor")
    for band, window in ranges.items():
        if len(window) != 2 or window[0] > window[1]:
            raise ValueError(f"threshold '{metric}': range '{band}' must be [lo, hi]")
    good, fair, poor = ranges["good"], ranges["fair"], ranges["poor"]
    if not (poor[0] <= fair[0] <= good[0] and good[1] <= fair[1] <= poor[1]):
        raise ValueError(f"threshold '{metric}': ranges must nest good within fair within poor")


def load_config(path: Path) -> AppConfig:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    rooms = [
        Room(id=r["id"], name=r["name"], entities=dict(r["entities"]), node=dict(r["node"]))
        for r in raw["rooms"]
    ]
    thresholds = {k: dict(v) for k, v in raw["thresholds"].items()}
    for metric, threshold in thresholds.items():
        _validate_threshold(metric, threshold)
    cfg = AppConfig(
        house_name=raw.get("house_name", "Home"),
        rooms=rooms,
        fleet=dict(raw["fleet"]),
        thresholds=thresholds,
    )
    for room in rooms:
        for metric, entity_id in room.entities.items():
            cfg._by_entity[entity_id] = (room.id, metric)
    return cfg
