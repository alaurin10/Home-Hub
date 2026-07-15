# Home-Hub

A single, version-controlled repository for a **DIY, local-first smart home** —
custom ESP32 sensors and lighting unified in **Home Assistant**, surfaced to two
deliberately separate places:

- **Apple Home** (HomeKit Bridge) for everyday control, Siri, and quick stats.
- The **custom dashboard app** (`apps/dashboard/`) for deep charts and history.

Local-first; nothing critical depends on the cloud. The git root maps to Home
Assistant's `/config` directory, so this repo *is* the configuration.

> **Status: Phase 0 — repo scaffolding.** No hardware is provisioned yet. The
> files here are the agreed structure and starter templates; real values
> (secrets, hostnames, tokens) get wired up from Phase 1 onward.

## Start here

- **[`docs/00-architecture.md`](docs/00-architecture.md)** — the full design &
  architecture plan (host platform, network, data layers, deployment, roadmap).
- **[`docs/01-naming-conventions.md`](docs/01-naming-conventions.md)** — binding
  naming rules + the device registry. Read **before** adding any device.
- **[`docs/03-bill-of-materials.md`](docs/03-bill-of-materials.md)** — what to buy, per phase.
- **[`docs/06-verification.md`](docs/06-verification.md)** — how each phase is verified.
- **[`docs/08-audit-2026-06.md`](docs/08-audit-2026-06.md)** — June 2026 project
  audit: findings, hardening checklist, and the prioritized feature backlog.
- **[`docs/09-roadmap.md`](docs/09-roadmap.md)** — infra roadmap: network
  services (DNS, reverse proxy, Tailscale) + monitoring that watches the watcher.
- **[`docs/10-remote-access.md`](docs/10-remote-access.md)** — dashboards in any
  browser via Cloudflare Tunnel + Access (no VPN client, no inbound ports).

## Repository layout

| Path | What it is |
|---|---|
| `configuration.yaml` | Thin HA entrypoint; real config lives in `packages/` |
| `packages/` | DRY, modular HA config (recorder, homekit, monitoring, notifications) |
| `esphome/` | ESP device firmware configs; `common/base.yaml` is the shared DRY base |
| `dashboards/` | Lovelace dashboards (YAML) |
| `apps/dashboard/` | Custom dashboard app (FastAPI + React) — runs on the Docker VM, demo mode standalone |
| `zigbee2mqtt/`, `mosquitto/` | Mirrored add-on configs (authored parts only; runtime state is backup-only) |
| `proxmox/` | Host notes: VM specs, USB passthrough, snapshot policy |
| `.github/workflows/` | CI validation gate + (Phase 8) self-hosted OTA deploy |
| `scripts/` | Deploy helpers used by the Phase 8 pipeline |
| `docs/` | Architecture, naming, runbooks, verification |

## Secrets

Real secrets are **never** committed. Copy the templates and fill them in locally:

```bash
cp secrets.yaml.example secrets.yaml            # Home Assistant secrets
cp esphome/secrets.yaml.example esphome/secrets.yaml
cp .env.example .env                            # tooling / deploy runner
```

`secrets.yaml`, `esphome/secrets.yaml`, `.env`, and all runtime state are
gitignored. CI substitutes the `*.example` files to validate config without real
credentials.

## Working model

Edit → commit → push → **CI validates** (`esphome config` + HA `check_config`) →
merge to `main`. From Phase 8, a merge to `main` also **auto-deploys OTA** to the
affected devices via a self-hosted runner on the LAN. See `docs/00-architecture.md`
§4 and §13.
