"""Provider protocol: one interface, two implementations (real HA / simulator).

A provider owns the entity state world. It must:
  - answer a full snapshot() of current states,
  - answer history() for a set of entities over a range,
  - push {entity_id, value, ts} dicts to the callback given via subscribe()
    whenever a state changes,
  - do its long-running work inside run() (started as a lifespan task).
"""

from typing import Any, Callable, Protocol

StateEvent = dict[str, Any]  # {"entity_id": str, "value": float|str|None, "ts": float}


class Provider(Protocol):
    def subscribe(self, callback: Callable[[StateEvent], None]) -> None: ...

    async def snapshot(self) -> dict[str, StateEvent]: ...

    async def history(
        self, entity_ids: list[str], hours: float, points: int
    ) -> tuple[dict[str, list[dict]], str]:
        """Returns ({entity_id: [point dicts]}, kind) where kind is
        "raw" (points have v) or "stats" (points have mean/min/max)."""
        ...

    async def run(self) -> None: ...
