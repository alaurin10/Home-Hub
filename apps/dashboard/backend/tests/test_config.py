"""config.yaml loading and threshold-schema validation."""

from pathlib import Path

import pytest

from app.config import load_config

REPO_CONFIG = Path(__file__).resolve().parent.parent.parent / "config.yaml"

MINIMAL = """
rooms:
  - id: office
    name: Office
    entities: {co2: sensor.office_air_co2}
    node: {status: binary_sensor.office_air_status}
fleet: {stale_nodes: sensor.stale, problem: binary_sensor.problem}
thresholds:
  co2: {THRESHOLD}
"""


def _load_with_threshold(tmp_path, threshold: str):
    path = tmp_path / "config.yaml"
    path.write_text(MINIMAL.replace("{THRESHOLD}", threshold), encoding="utf-8")
    return load_config(path)


def test_repo_config_parses():
    cfg = load_config(REPO_CONFIG)
    for room in cfg.rooms:
        assert set(room.node) == {"status", "wifi_signal", "uptime", "esphome_version", "ip_address"}
        assert room.node["esphome_version"] in cfg.all_entities
        assert room.node["ip_address"] in cfg.all_entities
    assert "ranges" in cfg.thresholds["temperature"]
    assert "bounds" in cfg.thresholds["co2"]


def test_valid_bounds_and_ranges(tmp_path):
    _load_with_threshold(tmp_path, "{bounds: [800, 1200, 2000], unit: ppm}")
    _load_with_threshold(
        tmp_path, "{ranges: {good: [67, 75], fair: [64, 78], poor: [60, 82]}, unit: ppm}"
    )


def test_rejects_bounds_and_ranges_together(tmp_path):
    with pytest.raises(ValueError, match="exactly one"):
        _load_with_threshold(
            tmp_path,
            "{bounds: [1, 2, 3], ranges: {good: [1, 2], fair: [0, 3], poor: [0, 4]}, unit: ppm}",
        )


def test_rejects_neither_bounds_nor_ranges(tmp_path):
    with pytest.raises(ValueError, match="exactly one"):
        _load_with_threshold(tmp_path, "{unit: ppm}")


def test_rejects_unsorted_bounds(tmp_path):
    with pytest.raises(ValueError, match="ascending"):
        _load_with_threshold(tmp_path, "{bounds: [1200, 800, 2000], unit: ppm}")


def test_rejects_non_nested_ranges(tmp_path):
    with pytest.raises(ValueError, match="nest"):
        _load_with_threshold(
            tmp_path, "{ranges: {good: [60, 80], fair: [64, 78], poor: [60, 82]}, unit: ppm}"
        )
