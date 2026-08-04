"""Air score: one number per room, and one for the house.

A room starts at 100 and loses points for every reading past its comfortable
band — *distance past the band x a weight*. Nothing is capped per metric, so one
very bad reading can carry the score down on its own. That is deliberate: the
score answers "should I do something", it is not an average of virtues.

The parts are always returned alongside the number, and the Settings -> Air
score tab renders them verbatim. That is what stops the explanation on screen
drifting from the value on screen.

Weights, targets and bands are tunable from an optional `score:` block in
config.yaml; the defaults below keep an existing config working untouched.
"""

from dataclasses import dataclass

# Targets are the point past which a metric starts costing points. The comfort
# metrics have no target here — they use the `good` window from thresholds, so
# retuning comfort bands in Settings moves the score too.
DEFAULT_TARGETS: dict[str, float] = {"co2": 800.0, "pm2_5": 12.0, "voc": 150.0}

# A weight is either a flat per-unit rate or a list of [from, rate] tiers that
# steepen as the reading climbs. Tiers are progressive, like tax brackets: each
# rate applies only to the part of the reading inside its tier.
#
# CO₂ is tiered because its bands are not evenly bad. 1,000 ppm is still an
# acceptable occupied room and should barely dent the score; 2,000 is headaches
# and fatigue and should gut it. A single rate cannot do both — set it gentle
# enough for 1,000 and 2,000 barely registers, steep enough for 2,000 and an
# ordinary occupied bedroom scores as a problem.
DEFAULT_WEIGHTS: dict[str, float | list] = {
    "co2": [                  # per ppm, by band
        [800.0, 0.015],       #   800–1,000  acceptable for an occupied room
        [1000.0, 0.045],      # 1,000–2,000  stuffy: sleepiness, reduced focus
        [2000.0, 0.10],       #      >2,000  poor ventilation: headaches, fatigue
    ],
    "pm2_5": 0.7,         # per µg/m³ over target
    "voc": 0.1,           # per index point over target
    "temperature": 2.0,   # per °F outside the good band, either side
    "humidity": 1.1,      # per % outside the good band, either side
}
DEFAULT_BANDS: dict[str, float] = {"excellent": 90.0, "good": 75.0, "fair": 55.0}
DEFAULT_HOUSE: dict[str, float] = {"worst_weight": 0.55}

# Only these contribute. pm1_0/pm10/nox are reported and charted, but scoring
# them as well would double-count the same particulate/gas event.
SCORED_METRICS = ("co2", "pm2_5", "voc", "temperature", "humidity")

LABELS = {
    "co2": "CO₂",
    "pm2_5": "PM2.5",
    "voc": "VOC index",
    "temperature": "Temperature",
    "humidity": "Humidity",
}
UNITS = {"co2": "ppm", "pm2_5": "µg/m³", "voc": "", "temperature": "°F", "humidity": "%"}
DIGITS = {"co2": 0, "pm2_5": 1, "voc": 0, "temperature": 1, "humidity": 0}

# Product copy, not logic — kept in one place so it reads as copy and can be
# edited without touching the arithmetic. {rest} is filled in by _rest().
#
# None of these claim a *cause*. The design's CO₂ line read "...and still
# climbing after cooking", which the advisory cannot know — a bedroom at 6 AM is
# occupancy, not dinner. Causal claims live in the insight feed, where they are
# hedged and ship their evidence; the advisory only ever states the reading and
# the action.
ADVISORY = {
    "co2": (
        "{room} CO₂ is at {value} ppm — crack a window for ten minutes and it should "
        "settle under {target}. {rest}"
    ),
    "pm2_5": (
        "{room} particulates are at {value} µg/m³ — run the hood or an air purifier "
        "until it drops under {target}. {rest}"
    ),
    "voc": (
        "{room} VOC index is at {value} — something is off-gassing. Air the room out "
        "until it falls under {target}. {rest}"
    ),
    "temperature_high": (
        "{room} is at {value} °F, above the {target} °F top of your comfort band — "
        "shade it or move some air through. {rest}"
    ),
    "temperature_low": (
        "{room} is at {value} °F, below the {target} °F bottom of your comfort band — "
        "it will read cold until the heat catches up. {rest}"
    ),
    "humidity_high": (
        "{room} humidity is at {value} %, above the {target} % top of your comfort band — "
        "run the fan or a dehumidifier before it settles into the walls. {rest}"
    ),
    "humidity_low": (
        "{room} humidity is at {value} %, below the {target} % bottom of your comfort band — "
        "dry enough to feel it in your throat overnight. {rest}"
    ),
    "none": "Every room is inside its comfort band.",
}
REST_STEADY = "Everywhere else is holding steady in the comfort band."
REST_SECOND = "{room} is the next one to watch at a score of {score}."


@dataclass
class ScorePart:
    """One metric's contribution. `detail` is user-facing copy ("1,140 ppm vs
    800 target") — the UI prints it rather than re-deriving it."""

    metric: str
    label: str
    detail: str
    penalty: float
    value: float


class ScoreConfig:
    """Effective score settings: defaults, overlaid with config.yaml's optional
    `score:` block. Unknown keys raise, so a typo is caught at startup rather
    than silently scoring with a default."""

    def __init__(self, raw: dict | None = None) -> None:
        raw = raw or {}
        unknown = set(raw) - {"targets", "weights", "bands", "house"}
        if unknown:
            raise ValueError(f"score: unknown key(s) {', '.join(sorted(unknown))}")
        self.targets = _merge_numeric("score.targets", DEFAULT_TARGETS, raw.get("targets"))
        self.weights = _merge_weights(DEFAULT_WEIGHTS, raw.get("weights"), self.targets)
        self.bands = _merge_numeric("score.bands", DEFAULT_BANDS, raw.get("bands"))
        self.house = _merge_numeric("score.house", DEFAULT_HOUSE, raw.get("house"))
        if not (self.bands["excellent"] >= self.bands["good"] >= self.bands["fair"]):
            raise ValueError("score.bands: excellent >= good >= fair required")
        if not 0.0 <= self.house["worst_weight"] <= 1.0:
            raise ValueError("score.house.worst_weight: must be between 0 and 1")


def _merge_numeric(where: str, defaults: dict[str, float], override: dict | None) -> dict[str, float]:
    merged = dict(defaults)
    for key, value in (override or {}).items():
        if key not in defaults:
            raise ValueError(f"{where}: unknown key '{key}'")
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise ValueError(f"{where}.{key}: must be a number")
        merged[key] = float(value)
    return merged


def _weight_value(where: str, value) -> float | list[tuple[float, float]]:
    """One weight: a flat rate, or ascending [from, rate] tiers."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if not isinstance(value, list) or not value:
        raise ValueError(f"{where}: must be a number or a list of [from, rate] tiers")
    tiers: list[tuple[float, float]] = []
    for tier in value:
        if not isinstance(tier, (list, tuple)) or len(tier) != 2:
            raise ValueError(f"{where}: each tier must be [from, rate]")
        start, rate = tier
        for number in (start, rate):
            if not isinstance(number, (int, float)) or isinstance(number, bool):
                raise ValueError(f"{where}: tier bounds and rates must be numbers")
        tiers.append((float(start), float(rate)))
    if any(b[0] <= a[0] for a, b in zip(tiers, tiers[1:])):
        raise ValueError(f"{where}: tier bounds must ascend")
    return tiers


def _merge_weights(
    defaults: dict[str, float | list], override: dict | None, targets: dict[str, float]
) -> dict[str, float | list[tuple[float, float]]]:
    merged = {key: _weight_value(f"score.weights.{key}", value) for key, value in defaults.items()}
    for key, value in (override or {}).items():
        if key not in defaults:
            raise ValueError(f"score.weights: unknown key '{key}'")
        merged[key] = _weight_value(f"score.weights.{key}", value)
    for key, value in merged.items():
        if not isinstance(value, list):
            continue
        # Tiers replace the flat rate but not the target: the first tier has to
        # start where penalties start, or the score would dock points for a
        # reading the advisory is still calling fine.
        if key not in targets:
            raise ValueError(f"score.weights.{key}: tiers need a target; {key} scores off a band")
        if value[0][0] != targets[key]:
            raise ValueError(
                f"score.weights.{key}: first tier must start at the {key} target "
                f"({_fmt(targets[key], 0)}), not {_fmt(value[0][0], 0)}"
            )
    return merged


def _penalty_above(value: float, target: float, weight: float | list[tuple[float, float]]) -> float:
    """Points lost by a reading past its target. Tiered weights are progressive
    — each rate bites only on the part of the reading inside its own tier — so
    the curve steepens instead of stepping."""
    if not isinstance(weight, list):
        return max(0.0, value - target) * weight
    total = 0.0
    for i, (start, rate) in enumerate(weight):
        if value <= start:
            break
        ceiling = weight[i + 1][0] if i + 1 < len(weight) else value
        total += (min(value, ceiling) - start) * rate
    return total


def _fmt(value: float, digits: int) -> str:
    return f"{value:,.{digits}f}"


def _good_window(thresholds: dict, metric: str) -> tuple[float, float] | None:
    ranges = (thresholds.get(metric) or {}).get("ranges")
    if not ranges or "good" not in ranges:
        return None
    lo, hi = ranges["good"]
    return float(lo), float(hi)


def score_room(
    metrics: dict[str, float | None],
    thresholds: dict,
    cfg: ScoreConfig | None = None,
) -> tuple[int, list[ScorePart]] | None:
    """(score, parts) for one room, or None when the room reports nothing
    scoreable — an offline node must render its offline state, not a
    fabricated 100."""
    cfg = cfg or ScoreConfig()
    usable = {m: v for m, v in metrics.items() if m in SCORED_METRICS and isinstance(v, (int, float))}
    if not usable:
        return None

    parts: list[ScorePart] = []
    for metric in SCORED_METRICS:
        value = usable.get(metric)
        if value is None:
            continue
        weight = cfg.weights[metric]
        window = _good_window(thresholds, metric)
        if window is not None:
            lo, hi = window
            distance = lo - value if value < lo else max(0.0, value - hi)
            penalty = distance * weight
            detail = f"{_fmt(value, DIGITS[metric])} {UNITS[metric]} vs {_fmt(lo, 0)}–{_fmt(hi, 0)} band"
        else:
            target = cfg.targets[metric]
            penalty = _penalty_above(float(value), target, weight)
            unit = f" {UNITS[metric]}" if UNITS[metric] else ""
            detail = f"{_fmt(value, DIGITS[metric])}{unit} vs {_fmt(target, 0)} target"
        parts.append(
            ScorePart(
                metric=metric,
                label=LABELS[metric],
                detail=detail,
                penalty=penalty,
                value=float(value),
            )
        )

    total = sum(p.penalty for p in parts)
    return max(0, min(100, round(100 - total))), parts


def score_house(room_scores: list[int], cfg: ScoreConfig | None = None) -> int:
    """Weighted toward the worst room on purpose: one stuffy bedroom should not
    average away behind two clean ones."""
    cfg = cfg or ScoreConfig()
    if not room_scores:
        return 0
    worst_weight = cfg.house["worst_weight"]
    mean = sum(room_scores) / len(room_scores)
    return max(0, min(100, round(worst_weight * min(room_scores) + (1 - worst_weight) * mean)))


def band_for(score: int, cfg: ScoreConfig | None = None) -> str:
    cfg = cfg or ScoreConfig()
    if score >= cfg.bands["excellent"]:
        return "excellent"
    if score >= cfg.bands["good"]:
        return "good"
    if score >= cfg.bands["fair"]:
        return "fair"
    return "poor"


BAND_LABEL = {"excellent": "Excellent", "good": "Good", "fair": "Fair", "poor": "Poor"}


def _rest(rooms: list[tuple[str, int, list[ScorePart]]], worst_id: str, cfg: ScoreConfig) -> str:
    others = [(name, score) for name, score, _ in rooms if name != worst_id]
    if not others:
        return ""
    laggard = min(others, key=lambda r: r[1])
    if laggard[1] >= cfg.bands["good"]:
        return REST_STEADY
    return REST_SECOND.format(room=laggard[0], score=laggard[1])


def _advisory_key(part: ScorePart, thresholds: dict) -> str:
    """Which copy template a dominant part maps to. Comfort metrics read
    differently depending on which side of the band they fell off."""
    if part.metric not in ("temperature", "humidity"):
        return part.metric
    window = _good_window(thresholds, part.metric)
    if window and part.value < window[0]:
        return f"{part.metric}_low"
    return f"{part.metric}_high"


def house_summary(
    rooms: list[tuple[str, int, list[ScorePart]]],
    thresholds: dict,
    cfg: ScoreConfig | None = None,
) -> dict:
    """(score, band, worst_room, headline, advisory) from [(room_name, score, parts)].

    The advisory is generated from the worst *contributing part* of the worst
    room, so it always names something real rather than a generic nudge."""
    cfg = cfg or ScoreConfig()
    if not rooms:
        return {
            "score": 0,
            "band": "poor",
            "worst_room": None,
            "headline": "No rooms reporting",
            "advisory": "Every node is offline — check the fleet.",
        }

    scores = [score for _, score, _ in rooms]
    house = score_house(scores, cfg)
    worst_name, worst_score, worst_parts = min(rooms, key=lambda r: r[1])

    dominant = max(worst_parts, key=lambda p: p.penalty, default=None)
    if dominant is None or dominant.penalty <= 0.05:
        advisory = ADVISORY["none"]
    else:
        key = _advisory_key(dominant, thresholds)
        window = _good_window(thresholds, dominant.metric)
        if window is not None:
            target = window[0] if key.endswith("_low") else window[1]
        else:
            target = cfg.targets[dominant.metric]
        advisory = ADVISORY[key].format(
            room=worst_name,
            value=_fmt(dominant.value, DIGITS[dominant.metric]),
            target=_fmt(target, 0),
            rest=_rest(rooms, worst_name, cfg),
        ).strip()

    below_fair = sum(1 for s in scores if s < cfg.bands["fair"])
    if house >= cfg.bands["good"]:
        headline = "The house is comfortable"
    elif below_fair > 1:
        headline = f"{below_fair} rooms need attention"
    else:
        headline = "One room needs a window open"

    return {
        "score": house,
        "band": band_for(house, cfg),
        "worst_room": worst_name,
        "headline": headline,
        "advisory": advisory,
    }
