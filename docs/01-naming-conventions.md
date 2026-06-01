# 01 — Naming Conventions (BINDING)

> **Lock this before adding any device.** Renaming later causes entity churn,
> breaks long-term statistics (unit/id changes), and forces redoing Apple Home
> rooms/automations. Add new locations/roles **in the same PR** that uses them.

## Tokens

**Location** (closed list, lowercase):
`office, bedroom, living, kitchen, bath, garage, hall, outdoor`

**Role** (closed list):
`air, temp, motion, presence, contact, light, relay, env, power, leak`

## Rules

| Thing | Pattern | Example |
|---|---|---|
| ESPHome hostname (`name:`) | `esp-<location>-<role>` (hyphens, lowercase, DNS-safe) | `esp-office-air` |
| HA entity_id | `<domain>.<location>_<role>_<measurement>` (underscores) | `sensor.office_air_co2` |
| HA area | Title Case | `Office`, `Living Room` |
| Z2M friendly_name | `<location>_<role>_<descriptor>` (set at pairing) | `living_light_ceiling` |

- **Hyphens in hostnames, underscores in entity_ids.**
- A **multi-function node** is one device (role `air`/`env`); the **measurement**
  disambiguates the entities: `sensor.office_air_co2`, `sensor.office_air_pm25`,
  `sensor.office_air_temperature`, …
- **Freeze entity `unique_id`s before HomeKit pairing.** Changing them shows
  "No Response"/duplicates in Apple Home.
- **Freeze units** once a sensor has history — long-term statistics break on unit
  changes.
- **Never** leave a Zigbee device on its `0x00124b…` default — rename at pairing.

## Device registry (first 3 devices — named on paper)

| # | Hostname | Area | Role | Sensor / HW | Example entities | Phase |
|---|---|---|---|---|---|---|
| 1 | `esp-office-air` | Office | air | ESP32 + SCD40 (I²C) | `sensor.office_air_co2`, `sensor.office_air_temperature`, `sensor.office_air_humidity` | 2 |
| 2 | `esp-living-air` | Living Room | air | ESP32 + SCD40 (I²C) | `sensor.living_air_co2`, `sensor.living_air_temperature`, `sensor.living_air_humidity` | 6 |
| 3 | `esp-bedroom-air` | Bedroom | air | ESP32 + SCD40 (I²C) | `sensor.bedroom_air_co2`, `sensor.bedroom_air_temperature`, `sensor.bedroom_air_humidity` | 6 |

> Each new node = a thin `esphome/esp-<location>-<role>.yaml` that includes
> `common/base.yaml` (+ a sensor block from `common/sensors_common.yaml`) and sets
> `node_name` / `friendly_name`. Append rows here in the PR that adds the device.
