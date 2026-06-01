# InfluxDB 2.x — org / bucket / retention / token design

InfluxDB is the **high-resolution, long-history** store behind Grafana. Home
Assistant forwards a **curated allowlist** to it (see `packages/influxdb.yaml`);
it is deliberately *not* fed everything. See docs/00-architecture.md §8.

## Design

| Item | Value | Notes |
|---|---|---|
| Org | `home` | Single org |
| Bucket | `home_assistant` | High-res sensor data |
| Retention | e.g. `90d` | Bucket-level; LTS covers "forever" cheaply in HA |
| Write token | HA → Influx | `!secret influxdb_token` in `packages/influxdb.yaml` |
| Read token | Grafana → Influx | **read-only**; injected into Grafana via env, not git |

## Setup (Phase 4)

1. Install the **InfluxDB** add-on; complete onboarding → create org `home`.
2. Create bucket `home_assistant` with the chosen retention.
3. Create a **write** token (HA) and a **read-only** token (Grafana).
4. Put the write token in `secrets.yaml`; give Grafana the read token via env.

## Backup

Influx data + tokens are **runtime state → backup only** (Supervisor backup +
Proxmox snapshot), never git.
