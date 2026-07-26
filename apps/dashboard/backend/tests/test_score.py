"""Air score: the arithmetic, the bands, and the copy that explains them.

The worked example (CO₂ 1,140 / PM2.5 18 / VOC 210 -> 73) is the one the
Settings -> Air score tab renders, so it is pinned here: if the score moves, the
explanation on screen moves with it and this test says so.
"""

from pathlib import Path

import pytest

from app.config import build_effective_thresholds, load_config
from app.score import ScoreConfig, band_for, house_summary, score_house, score_room

CONFIG = load_config(Path(__file__).resolve().parent.parent.parent / "config.yaml")
THRESHOLDS = CONFIG.thresholds
CFG = CONFIG.score


def test_room_at_target_scores_100():
    metrics = {"co2": 800, "pm2_5": 12, "voc": 150, "temperature": 71.0, "humidity": 45}
    score, parts = score_room(metrics, THRESHOLDS, CFG)
    assert score == 100
    assert all(p.penalty == 0 for p in parts)


def test_worked_example_scores_73():
    # 1140 ppm -> 17.0 · 18 µg/m³ -> 4.2 · 210 VOC -> 6.0 = 27.2 penalty
    metrics = {"co2": 1140, "pm2_5": 18, "voc": 210, "temperature": 73.2, "humidity": 46}
    score, parts = score_room(metrics, THRESHOLDS, CFG)
    assert score == 73
    by_metric = {p.metric: p for p in parts}
    assert by_metric["co2"].penalty == pytest.approx(17.0)
    assert by_metric["pm2_5"].penalty == pytest.approx(4.2)
    assert by_metric["voc"].penalty == pytest.approx(6.0)
    # The detail strings are what the UI prints — they must name the target.
    assert by_metric["co2"].detail == "1,140 ppm vs 800 target"
    assert by_metric["temperature"].detail == "73.2 °F vs 67–75 band"


def test_parts_sum_to_the_deduction():
    metrics = {"co2": 1450, "pm2_5": 31, "voc": 260, "temperature": 79.4, "humidity": 62}
    score, parts = score_room(metrics, THRESHOLDS, CFG)
    assert sum(p.penalty for p in parts) == pytest.approx(100 - score, abs=0.5)


def test_comfort_metrics_penalise_both_sides():
    cold = score_room({"temperature": 62.0}, THRESHOLDS, CFG)[0]  # 5 °F under 67
    hot = score_room({"temperature": 80.0}, THRESHOLDS, CFG)[0]   # 5 °F over 75
    assert cold == hot == 90


def test_widening_the_comfort_band_raises_the_score():
    metrics = {"co2": 800, "temperature": 78.0, "humidity": 45}
    before = score_room(metrics, THRESHOLDS, CFG)[0]
    wider = build_effective_thresholds(
        THRESHOLDS, {"temperature": {"ranges": {"good": [64, 80], "fair": [62, 82], "poor": [60, 84]}}}
    )
    after = score_room(metrics, wider, CFG)[0]
    assert after > before
    assert after == 100


def test_offline_room_scores_none_not_zero():
    assert score_room({"co2": None, "temperature": None}, THRESHOLDS, CFG) is None
    assert score_room({}, THRESHOLDS, CFG) is None


def test_unscored_metrics_are_ignored():
    # pm1_0/pm10/nox are charted but not scored — scoring them would
    # double-count the same particulate event PM2.5 already covers.
    only_noise = score_room({"pm1_0": 90, "pm10": 140, "nox": 250}, THRESHOLDS, CFG)
    assert only_noise is None


def test_house_score_is_weighted_toward_the_worst_room():
    # 0.55 * 73 + 0.45 * 89.33 = 80.35 -> 80
    assert score_house([73, 97, 98], CFG) == 80
    assert score_house([90, 90, 90], CFG) == 90
    # ...and always sits at or below the plain mean when rooms disagree.
    assert score_house([50, 100, 100], CFG) < (50 + 100 + 100) / 3


def test_bands():
    assert band_for(95, CFG) == "excellent"
    assert band_for(90, CFG) == "excellent"
    assert band_for(75, CFG) == "good"
    assert band_for(55, CFG) == "fair"
    assert band_for(54, CFG) == "poor"


def test_advisory_names_the_worst_room_and_its_dominant_metric():
    kitchen = score_room({"co2": 1140, "pm2_5": 18, "voc": 210}, THRESHOLDS, CFG)
    bedroom = score_room({"co2": 620, "temperature": 70.0, "humidity": 44}, THRESHOLDS, CFG)
    living = score_room({"co2": 540, "temperature": 71.5, "humidity": 41}, THRESHOLDS, CFG)
    summary = house_summary(
        [("Kitchen", *kitchen), ("Bedroom", *bedroom), ("Living Room", *living)],
        THRESHOLDS,
        CFG,
    )
    assert summary["worst_room"] == "Kitchen"
    assert "Kitchen CO₂ is at 1,140 ppm" in summary["advisory"]
    assert "800" in summary["advisory"]
    assert summary["advisory"].endswith("holding steady in the comfort band.")
    assert summary["headline"] == "The house is comfortable"
    assert summary["band"] in ("excellent", "good", "fair", "poor")


def test_advisory_reads_the_low_side_of_a_comfort_band():
    dry = score_room({"humidity": 22, "temperature": 71.0}, THRESHOLDS, CFG)
    summary = house_summary([("Bedroom", *dry)], THRESHOLDS, CFG)
    assert "below the 35 % bottom" in summary["advisory"]


def test_advisory_when_everything_is_in_band():
    clean = score_room({"co2": 620, "temperature": 71.0, "humidity": 44}, THRESHOLDS, CFG)
    summary = house_summary([("Bedroom", *clean)], THRESHOLDS, CFG)
    assert summary["advisory"] == "Every room is inside its comfort band."


def test_headline_counts_rooms_below_fair():
    bad_a = score_room({"co2": 2200, "pm2_5": 60}, THRESHOLDS, CFG)
    bad_b = score_room({"co2": 2400, "pm2_5": 70}, THRESHOLDS, CFG)
    ok = score_room({"co2": 600}, THRESHOLDS, CFG)
    summary = house_summary(
        [("Kitchen", *bad_a), ("Bedroom", *bad_b), ("Living Room", *ok)], THRESHOLDS, CFG
    )
    assert summary["headline"] == "2 rooms need attention"
    # With another room struggling, the copy names it instead of the all-clear.
    assert "next one to watch" in summary["advisory"]


def test_no_rooms_reporting():
    summary = house_summary([], THRESHOLDS, CFG)
    assert summary["worst_room"] is None
    assert summary["score"] == 0


def test_config_block_overrides_defaults():
    cfg = ScoreConfig({"weights": {"co2": 0.1}, "bands": {"good": 80}})
    assert cfg.weights["co2"] == 0.1
    assert cfg.weights["pm2_5"] == 0.7  # untouched keys keep their default
    assert cfg.bands["good"] == 80
    # A doubled CO₂ weight must double that metric's penalty.
    assert score_room({"co2": 1000}, THRESHOLDS, cfg)[0] == 80


@pytest.mark.parametrize(
    "raw",
    [
        {"weights": {"co3": 1}},          # typo'd metric
        {"targets": {"co2": "high"}},     # non-numeric
        {"bands": {"good": 95}},          # good above excellent
        {"house": {"worst_weight": 2}},   # out of range
        {"wieghts": {}},                  # typo'd block
    ],
)
def test_config_block_rejects_nonsense(raw):
    with pytest.raises(ValueError):
        ScoreConfig(raw)
