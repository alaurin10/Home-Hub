#!/usr/bin/env python3
"""Entity-drift check: catch references to entities that don't exist.

Closes audit finding 2 (docs/08-audit-2026-06.md): the HomeKit allowlist is
hand-curated, and a forgotten/stale entry fails SILENTLY. This check
re-derives the fleet's entity IDs from the ESPHome configs and fails CI when
packages/ or dashboards/ reference a sensor./binary_sensor. entity that
nothing defines (typo, renamed node, dead allowlist entry).

HomeKit completeness is deliberately NOT checked: its allowlist curates
exclusions on purpose (VOC/NOx indices are not HomeKit-meaningful).

Assumption (matches docs/01-naming-conventions.md): entity IDs derive from
the device friendly_name + the short sensor name via HA slugify, e.g.
"Kitchen Air" + "PM2.5" -> sensor.kitchen_air_pm2_5. An explicit entity_id
override or a rename done in the HA UI would break that assumption — add
such entities to KNOWN_EXTERNAL below.

Only dependency: PyYAML.
"""

import re
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
ESPHOME_DIR = REPO / "esphome"

# Entities referenced in configs but defined outside this repo (UI-configured
# integrations, entity_id overrides, HA-UI renames). Empty today.
KNOWN_EXTERNAL: set[str] = set()


def make_loader() -> type:
    """SafeLoader that tolerates HA/ESPHome custom tags. `!include` yields the
    included path string so package includes can be resolved; other tags
    yield None."""

    class Loader(yaml.SafeLoader):
        pass

    def scalar(loader, node):
        return loader.construct_scalar(node)

    for tag in ("!include",):
        Loader.add_constructor(tag, scalar)
    for tag in ("!secret", "!lambda", "!env_var", "!include_dir_named",
                "!include_dir_list", "!include_dir_merge_named",
                "!include_dir_merge_list", "!input", "!extend", "!remove"):
        Loader.add_constructor(tag, lambda loader, node: None)
    return Loader


LOADER = make_loader()


def load_yaml(path: Path):
    with open(path, encoding="utf-8") as fh:
        return yaml.load(fh, Loader=LOADER)


def slugify(name: str) -> str:
    """HA slugify: lowercase, non-alphanumeric runs -> '_', strip '_'."""
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def collect_names(domain_block) -> list[str]:
    """Short sensor names in an ESPHome domain block (list of platform
    entries). Handles both top-level `name:` and nested sub-sensors
    (scd4x co2/temperature, wifi_info ip_address, ...)."""
    names = []
    for entry in domain_block or []:
        if not isinstance(entry, dict):
            continue
        if isinstance(entry.get("name"), str):
            names.append(entry["name"])
        for value in entry.values():
            if isinstance(value, dict) and isinstance(value.get("name"), str):
                names.append(value["name"])
    return names


def esphome_defined() -> set[str]:
    """All entity IDs defined across every esphome node. ESPHome text_sensors
    surface in HA's `sensor` domain."""
    all_ids: set[str] = set()
    for node_file in sorted(ESPHOME_DIR.glob("esp-*.yaml")):
        node = load_yaml(node_file)
        friendly = node["substitutions"]["friendly_name"]
        docs = [node] + [
            load_yaml(ESPHOME_DIR / inc)
            for inc in (node.get("packages") or {}).values()
            if isinstance(inc, str)
        ]
        for doc in docs:
            for domain, ha_domain in (("sensor", "sensor"),
                                      ("binary_sensor", "binary_sensor"),
                                      ("text_sensor", "sensor")):
                for short in collect_names(doc.get(domain)):
                    all_ids.add(f"{ha_domain}.{slugify(friendly + ' ' + short)}")
    return all_ids


def template_defined() -> set[str]:
    """Entity IDs of HA template sensors declared in packages/."""
    ids: set[str] = set()
    for pkg in sorted((REPO / "packages").glob("*.yaml")):
        doc = load_yaml(pkg)
        if not isinstance(doc, dict):
            continue
        for block in doc.get("template") or []:
            if not isinstance(block, dict):
                continue
            for domain in ("sensor", "binary_sensor"):
                for entry in block.get(domain) or []:
                    if isinstance(entry, dict) and isinstance(entry.get("name"), str):
                        ids.add(f"{domain}.{slugify(entry['name'])}")
    return ids


def referenced() -> dict[str, set[str]]:
    """entity_id -> files referencing it, from packages/ + dashboards/
    (comments stripped; dynamic Jinja concatenations intentionally don't
    match — they are availability-guarded in the templates)."""
    refs: dict[str, set[str]] = {}
    for path in sorted((REPO / "packages").glob("*.yaml")) + sorted(
        (REPO / "dashboards").glob("*.yaml")
    ):
        text = re.sub(r"(?m)#.*$", "", path.read_text(encoding="utf-8"))
        for match in re.findall(r"\b(?:sensor|binary_sensor)\.[a-z0-9_]+\b", text):
            refs.setdefault(match, set()).add(str(path.relative_to(REPO)))
    return refs


def main() -> int:
    defined = esphome_defined() | template_defined() | KNOWN_EXTERNAL
    failures = []

    for entity, files in sorted(referenced().items()):
        if entity not in defined:
            failures.append(
                f"UNDEFINED: {entity} (referenced in {', '.join(sorted(files))})\n"
                "  -> no ESPHome node or template sensor defines this. Typo, or a\n"
                "     stale entry left behind after renaming/removing a node?"
            )

    if failures:
        print(f"entity drift check FAILED ({len(failures)} problem(s)):\n")
        print("\n\n".join(failures))
        return 1

    print(
        f"entity drift check OK: {len(defined)} defined entities, "
        f"{len(referenced())} referenced entities all resolve."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
