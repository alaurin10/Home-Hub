# home-hub — Design & Architecture Plan

> **Living architecture document.** This is the consolidated, agreed design,
> evolved from the starting plan through a critical design + alternatives pass.
> It is the source of truth for *why* the system is shaped the way it is; keep it
> current as phases land. **Status: Phase 0 (scaffolding) — no hardware provisioned yet.**

A single repository for a DIY smart home — custom ESP32 sensors, lighting, and
more — unified in **Home Assistant** and surfaced to two deliberately separate
places: **Apple Home** for everyday control/Siri/basic stats, and **InfluxDB +
Grafana** for deep charts and history. Local-first; nothing critical depends on
the cloud.

---

## Context — why this plan

You want a self-hosted, local-first smart home where DIY devices (air-quality
sensors first, then lighting and more) all report into Home Assistant, which
(a) exposes curated entities to **Apple Home** via the HomeKit Bridge (your
HomePod is the always-on hub + Thread border router), and (b) forwards selected
metrics to **InfluxDB**, charted in **Grafana**. The control layer and the data
layer stay separate by design.

This plan resolves the starting plan's open decisions, fills the operational
gaps that bite later (backups, power, VLAN discovery, fleet updates, entity
churn), and reflects an alternatives pass (Docker vs HA OS, reusing existing
hardware, future-proof radios).

**Decisions (settled):**

| Area | Decision | Why |
|---|---|---|
| Host platform | **HA OS in a Proxmox VM** on a mini PC | Easy supported HA appliance (Supervisor/add-ons/backups) **plus** room for "a few extras" as isolated LXCs and painless growth + VM snapshots |
| Host hardware | **Reused HP EliteDesk 600 G3 Mini** (i5-7500T, 16 GB, 128 GB SSD), on a **UPS** | Supersedes the original buy-a-new-mini-PC rec (N150/N305-class) — a capable machine was already on hand; VM disks sized to fit 128 GB. See `proxmox/README.md` |
| DIY device transport | **ESPHome native API** (encrypted WiFi) | No broker, auto-discovery, robust reconnect |
| Lighting / low-power mesh | **Zigbee2MQTT + Mosquitto**, **HA Connect ZBT-2** coordinator | Best device support; survives HA restarts; config-as-code friendly; modern dual-chip radio for a 20–60 device mesh |
| Thread/Matter | **Via the HomePod now**; dedicated HA Thread radio only later | One radio per protocol (multiprotocol-on-one-stick still unreliable in 2026) |
| Default sensor chip | **classic ESP32 (WROOM-32 / S3)**; a couple of ESP32-C6 as a cheap Thread hedge | Most mature ESPHome support |
| Recorder DB | **MariaDB** (add-on) | SQLite gets sluggish at 20–60 devices; avoids a later migration |
| Long-term data | **InfluxDB 2.x + Grafana** (+ HA long-term statistics) | Built-in UI, tokens, retention buckets, good Grafana support |
| Secrets | **private repo + gitignored `secrets.yaml`/`.env`** + committed `*.example` | Never commit real secrets |
| Remote access | **Tailscale** for admin + the HA Companion app; **Cloudflare Tunnel + Access** for browser dashboards on any device | Reach dashboards anywhere, no open ports, data stays local |
| Network | ESP/IoT devices on an **isolated IoT VLAN** + DHCP reservations | ESP32s aren't hardened; isolate them |
| Fleet deployment | **Auto push-to-`main` → OTA** (validate in cloud, deploy via a self-hosted LAN runner) | Change config from anywhere and ship remotely; safe enough on a private solo repo |

**Research grounding (2026):** N100/N150-class mini PC beats a Pi 5 once SSD/
case/PSU added; InfluxDB 2.x is the pragmatic pick (3 Core drops Flux); ESPHome
has early OpenThread (C6/H2) but immature native Matter; classic ESP32 has the
most mature ESPHome support; **HA Supervised is deprecated/unsupported in 2026**
(only HA OS + HA Container remain); **Proxmox is the 2026 consensus** once you'll
run more than just HA; **multiprotocol radios** can't reliably run Zigbee + Thread
at once (one radio per protocol).

### Decision log — alternatives considered
- **Platform:** *HA OS bare metal* (simplest, but can't co-host extras and dead-ends
  growth) vs *pure HA Container / docker-compose* (most config-as-code, but loses
  Supervisor/add-ons and highest upkeep) vs *HA Supervised* (**ruled out —
  unsupported in 2026**) vs **Proxmox + HA OS VM (chosen)** — best balance of easy
  HA + flexibility for "mostly HA + a few extras." **Fallback if you want minimum
  complexity: HA OS bare metal** — for the repo it's identical (same `/config`);
  Proxmox only adds host snapshots, and migrating later = reinstall host + restore
  HA from backup.
- **Zigbee radio:** Zigbee-only *ZBDongle-P* (proven budget) vs **ZBT-2 (chosen** —
  modern dual-chip, native HA support, better at scale**)**; multiprotocol-single-
  stick rejected (unreliable). Thread handled by the HomePod; add a 2nd dedicated
  Thread radio later only if HA-native Matter-over-Thread is wanted.
- **Recorder:** SQLite (default) vs **MariaDB (chosen** for medium scale**)**.

---

## 1. Architecture

**Host layer (one mini PC):**
```
  Proxmox host  (mini PC · 16 GB · SSD · on UPS)
  ├── VM: Home Assistant OS  ── Supervisor add-ons:
  │        ESPHome · Mosquitto · Zigbee2MQTT · InfluxDB 2.x ·
  │        Grafana · MariaDB · Tailscale · SSH/VS Code Server
  │        └── USB passthrough (by Device ID) ──► ZBT-2 Zigbee coordinator
  ├── VM: Docker host (Debian) ── containerized apps (separate repos; data gitignored):
  │        garmin-mcp (+ future MCP servers) · Garmin insights dashboard
  │        (FastAPI + React + sync job + DB — distinct from the MCP data path)
  ├── LXC: Pi-hole ── network-wide DNS filtering
  └── (room to grow) Node-RED · a later Frigate NVR — isolated from HA
```

**Device + data flow:**
```
   ESP32 sensors        DIY ESP lights        Zigbee devices
  (air/temp/motion)   (LED strips, relays)  (bulbs, sensors, remotes)
        |                     |                      |
        | ESPHome native API  | ESPHome API          | Zigbee radio (802.15.4)
        | (encrypted, WiFi)   |                      v
        |                     |            +---------------------+
        |                     |            | ZBT-2 + Zigbee2MQTT |
        |                     |            +----------+----------+
        |                     |                       | MQTT
        +----------+----------+-----------------------+
                              |
                    +---------v----------+
                    |   Home Assistant   |   (HA OS VM on Proxmox)
                    |  + Mosquitto       |   central brain
                    +---------+----------+
                              |
        +---------------------+-----------------------+
        |                                             |
+-------v---------+                        +----------v-----------+
| HomeKit Bridge  |                        |  InfluxDB 2.x        |
|  -> Apple Home  |                        |  + Grafana           |
+-------+---------+                        +----------+-----------+
        |                                             |
  HomePod (Home Hub + Thread BR) + iPhone    Browser / HA Companion app /
  (Siri, remote via iCloud)                  wall tablet / Grafana
                                             (charts, history)

  Remote access: Tailscale (admin + HA app)  |  Cloudflare Tunnel + Access (dashboards, any browser)
```

**Principles:** local-first; config-as-code; DRY (shared ESPHome `base.yaml`);
naming locked early. **Honest config-as-code boundary:** full recovery =
**git (authored config) + encrypted backups (runtime state)** + **Proxmox VM
snapshots** — no single one is enough. **Keep automations in HA** (or a Node-RED
add-on), never in Apple Home, so the HomePod/iCloud is never in your automation
critical path.

---

## 2. Hardware & Bill of Materials (buy per phase)

| Item | Phase | ~USD | Notes |
|---|---|---|---|
| Host: **reused HP EliteDesk 600 G3 Mini** (i5-7500T, 16 GB, 128 GB) | 1 | $0 | Supersedes the buy rec (was: N150/N305, ~$180–300); see `proxmox/README.md` |
| **UPS 350–600 VA** | 1 | $55–90 | **Strongly recommended** — protects DBs from unclean power loss; enables NUT graceful shutdown |
| ESP32 dev board (WROOM-32 / S3) ×2 | 2 | $6–12 ea | Buy 2 (spare/dev) |
| 1–2× ESP32-**C6** (Thread hedge) | 2 | $6–10 ea | Optional; keeps Thread door open |
| Air sensor: **SCD40** (CO2+RH+T) or **SEN5x** (PM+VOC+NOx+RH+T) | 2 | $20–60 | SCD40 = true CO2 cheap; SEN5x = richer AQ |
| Breadboard + jumpers; USB-C cables + 5 V PSUs ×2–3 | 2 | $20–40 | First wiring + power |
| **HA Connect ZBT-2** Zigbee coordinator | 5 | $30–40 | Modern dual-chip; native HA support (ZBDongle-P ~$25 = budget alt) |
| **USB 2.0 extension cable (1–2 m)** | 5 | $6–9 | **Critical** anti-interference (USB2, not 3) |
| Zigbee bulb(s) (IKEA/Hue/Sonoff) ×1–2 | 5 | $10–18 ea | IKEA = cheap, Z2M-friendly |
| Zigbee motion/contact sensors (optional) | 6 | $8–15 ea | For automations |
| Off-site backup storage (cloud) | 7 | ~$0–6/mo | Google Drive free tier likely enough |

MariaDB, Node-RED, Pi-hole, etc. are **free add-ons** — no hardware cost.
**First cart (Phases 1–2): ~$260–420.** Add the Zigbee kit at Phase 5.

---

## 3. Network & USB passthrough (do in Phase 1 — silently breaks discovery if skipped)

- **IoT VLAN** for all ESP/Zigbee-adjacent gear; **DHCP reservations by MAC** so
  `esp-<location>-<role>` always gets the same IP.
- **mDNS across VLANs is the trap:** ESPHome auto-discovery **and** HomeKit rely
  on mDNS/Bonjour, which **doesn't cross VLANs by default**. Run an **mDNS
  reflector** (Avahi on the router/firewall) or give the HA VM an interface into
  the IoT VLAN. Firewall: IoT→HA (API 6053, mDNS 5353), HA→IoT (OTA/API), HomePod
  + iPhone→HA; otherwise block IoT→main LAN.
- **USB passthrough (Proxmox):** pass the ZBT-2 to the HA OS VM **by Device ID**
  (`/dev/serial/by-id/...`), not by port, so reboots/re-enumeration don't break
  Zigbee. For maximum mesh stability, PCI-passthrough the USB controller. Keep
  the stick on a **USB-2 extension** away from the chassis/NVMe/AP.
- **No public port-forwarding** (no inbound ports, ever). Remote access =
  **Tailscale** (admin + HA Companion app) **plus an outbound-only Cloudflare
  Tunnel + Access** for browser dashboards (§10); behind the tunnel set HA
  `use_x_forwarded_for: true` + `trusted_proxies`. Apple Home is separate
  (HomePod → iCloud).
- **Deploy runner (Phase 8):** the self-hosted CI runner LXC needs **outbound** to
  GitHub plus LAN access to the **HA VM (SSH + API)** and the **IoT VLAN OTA ports**
  (ESPHome 6053/3232). No inbound exposure required.

---

## 4. Deployment & fleet updates — automatic push-to-deploy (CI/CD)

**Goal:** push to `main` → it **auto-deploys OTA to all affected devices**, so you
can change your smart home and ship it from anywhere (even the GitHub mobile app).
The catch: your devices sit on a private LAN GitHub's cloud can't reach — so the
deploy step runs on a **self-hosted GitHub Actions runner inside your home**. A
private repo with you as the only pusher makes the trade-offs acceptable.

**Topology**
```
  You (anywhere) ──push/merge to main──► GitHub (private repo)
                                           │ triggers
   ┌───────────────────────────────────────┴──────────────────────┐
   │ CLOUD runners — VALIDATE: esphome config + HA check_config     │ ← gate
   └───────────────────────────────────────┬──────────────────────┘
                              on success    │ triggers
   ┌───────────────────────────────────────▼──────────────────────┐
   │ SELF-HOSTED runner on your LAN (Proxmox LXC, label home-lan):  │
   │  1. sync HA/Z2M/Grafana config → reload via HA API             │
   │  2. ESPHome compile + OTA to CHANGED devices (canary first)    │
   │  3. post-deploy health check → notify / rollback on failure    │
   └────────────────────────────────────────────────────────────────┘
```

**Two workflows**
1. **Validate (cloud gate)** — the §13 workflows (`esphome-validate.yml` +
   `ha-check.yml`) on every PR **and** push to `main`. Fast; blocks bad config
   from ever reaching a device.
2. **`deploy.yml` (self-hosted `home-lan`, on push to `main`, `needs:` validate):**
   - **Change detection:** `git diff` the push — if `esphome/common/base.yaml` (or
     shared bits) changed → target **all** nodes; else only the changed
     `esphome/<node>.yaml` (don't reflash 50 devices for a 1-node edit).
   - **Config:** sync repo → `/config` (runner has SSH to the HA VM); **reload via
     the HA API** (targeted reloads, or a restart for core changes); copy mirrored
     Z2M/Grafana configs + restart those add-ons.
   - **ESPHome OTA, staged:** flash a **canary** node (`esphome run <node>.yaml`),
     **health-check** it (poll HA until its connection sensor is back; timeout =
     fail), then flash the rest in small batches.
   - **Post-deploy health check:** every targeted device must re-report in HA, or
     the run **fails + pushes a notification**. A **concurrency lock** prevents
     overlapping deploys.

**Secrets / accepted trade-off (fine on a private repo):** WiFi creds, per-device
OTA passwords/API keys, and a **long-lived HA token** live as **GitHub Actions
secrets** + on the runner — never in the repo. Restrict the runner to **`main`
pushes from this repo only** (no fork-PR execution), in an **isolated LXC** that
can reach only the HA VM + IoT OTA ports. The trade-off you're accepting: deploy
credentials sit on an always-on LAN runner.

**Safety rails (auto-OTA can brick a fleet):**
- Validation gate **must** pass first.
- **Canary + health check + batches**, never all-at-once-blind. (ESPHome keeps the
  old firmware if an upload fails; the canary catches *compiles-but-wrong*.)
- **Rollback = `git revert`** → the pipeline redeploys the last-good state
  (documented in `docs/05-runbook-recovery.md`).
- **Only config + firmware auto-deploy;** HA Core / add-on **version upgrades stay
  manual** (snapshot/backup first).

**Hardening checklist — complete BEFORE flipping `DEPLOY_ENABLED` (Phase 8).**
The shipped `deploy.yml` / `scripts/deploy-esphome.sh` are skeletons; these are
their known sharp edges (2026-06 audit, `docs/08-audit-2026-06.md`):
- [ ] Implement real **health-check polling** (poll the HA API until the node's
      status sensor is back; hard timeout = fail) — currently a TODO stub.
- [ ] **Per-node failure tracking** in the batch OTA loop — a failure mid-batch
      must stop the rollout, not let later nodes flash blind.
- [ ] **Automated rollback**: wire `git revert` + redeploy of last-good state
      into the pipeline (today it's documentation only).
- [ ] **Deploy-failure notification** (HA Companion push or GitHub notification)
      — the "fails + pushes a notification" rail below is not yet implemented.
- [ ] Real **secret injection** on the runner (copy from its secure store) —
      currently a TODO stub in `reload-ha.sh` / `deploy-esphome.sh`.
- [ ] **Branch protection on `main`** (require the validate checks) so a direct
      push can't trigger a deploy of unvalidated config — see `docs/07-github-setup.md`.
- Easiest safe UX: branch → PR (validates) → merge to `main` → deploy. Prefer
  pushing straight to `main`? `deploy.yml` still `needs:` validate, so a bad push
  validates-then-skips and alerts.

**Remote-from-anywhere:** push via GitHub from a laptop or the mobile app; the LAN
runner deploys (outbound to GitHub only — **no inbound exposure**); watch progress
in the Actions tab. Tailscale stays for *you* to reach HA/Grafana directly.

**Build order:** use manual ESPHome **"Update All"** while building (Phases 2–6);
turn on this pipeline in **Phase 8** once the system is stable. Lighter interim
options: the HA **"Git pull" add-on** (config only) or a small poll/webhook script.

---

## 5. Config-as-code on HA OS + git workflow

**Mechanism:** install **Advanced SSH & Web Terminal** (shell w/ `git`) +
**Studio Code Server** (in-browser VS Code w/ YAML validation); `git init` in
**`/config`** (the git root); auth to GitHub via an SSH **deploy key** or
fine-grained PAT scoped to this private repo; edit → commit → push → PR triggers
CI → merge → host pulls.

**State categories (the honest boundary):**
1. **Git-versioned** (`/config`): `configuration.yaml`, `automations.yaml`,
   `scripts.yaml`, `scenes.yaml`, `packages/`, `esphome/`, YAML dashboards,
   `*.example` templates.
2. **Add-on configs outside `/config`** (`/addon_configs/<slug>/`): **mirror**
   authored files into the repo (`zigbee2mqtt/configuration.yaml`, Grafana
   provisioning/dashboards); generated state (Z2M `coordinator_backup.json` +
   device DB, Influx/MariaDB data + tokens) → **backup only**.
3. **Pure runtime, never git** (`.storage/` incl. **HomeKit pairing**, recorder
   DB, Zigbee network DB) → **Supervisor backup + Proxmox snapshot only**.

**`.gitignore` (root = `/config`):** ignore `secrets.yaml`, `.env`, `*.key/.pem`,
`.ssh/`, `.storage/`, `.cloud/`, `*.db*`, `home-assistant_v2.db*`, `*.log`,
`deps/`, `tts/`, `.cache/`, `__pycache__/`, `.esphome/`, `*.bin`, `backups/`,
`.DS_Store`, `.HA_VERSION`. Commit `secrets.yaml.example`, `.env.example`, and a
separate `esphome/secrets.yaml.example` (ESPHome has its own secrets file).

---

## 6. Repository structure (git root maps to HA's `/config`)

```
home-hub/                          # == HA OS /config (git root)
├── README.md
├── .gitignore
├── .ha-version  .esphome-version  # single-source CI version pins (§13)
├── .yamllint.yml                  # lint rules for lint.yml
├── .github/workflows/
│   ├── esphome-validate.yml   # cloud validation gate (pinned ESPHome)
│   ├── ha-check.yml           # cloud validation gate (pinned HA)
│   ├── lint.yml               # yamllint + gitleaks secret scan
│   ├── upgrade-canary.yml     # weekly check vs latest HA/ESPHome
│   └── deploy.yml             # self-hosted LAN runner: OTA deploy on push to main
├── scripts/
│   ├── deploy-esphome.sh      # change-detect + canary + batched OTA + health check
│   └── reload-ha.sh           # sync /config + HA API reloads
├── configuration.yaml             # thin; !include packages/
├── secrets.yaml.example  .env.example
├── packages/                      # DRY modular HA config
│   ├── recorder.yaml              # MariaDB recorder + retention + excludes
│   ├── influxdb.yaml              # influxdb integration + include allowlist
│   ├── homekit.yaml               # HomeKit bridge + include_entities allowlist
│   ├── monitoring.yaml            # fleet stale/disconnect detection + alerts
│   ├── comfort.yaml               # derived dew point + absolute humidity
│   └── notifications.yaml         # companion-app notify groups
├── automations.yaml  scripts.yaml  scenes.yaml
├── dashboards/{overview.yaml,air-quality.yaml}
├── esphome/
│   ├── common/{base.yaml,sensors_common.yaml}
│   ├── esp-office-air.yaml        # first node, !include common/base.yaml
│   └── secrets.yaml.example
├── zigbee2mqtt/configuration.yaml # mirror of /addon_configs/<z2m>
├── mosquitto/{README.md,acl.example}
├── grafana/provisioning/{datasources/influxdb.yaml.example,dashboards/*}
├── influxdb/README.md             # org/bucket/retention/token design
├── proxmox/README.md              # host notes: VM specs, USB passthrough, snapshot policy
└── docs/
    ├── 00-architecture.md (this doc)   01-naming-conventions.md
    ├── 02-bootstrap-proxmox-haos.md    03-bill-of-materials.md
    ├── 04-runbook-backups.md           05-runbook-recovery.md
    ├── 06-verification.md              07-github-setup.md
    └── 08-audit-2026-06.md
```
No `docker-compose.yml` (Supervisor manages services inside the VM). `packages/`
keeps HA config DRY. Start with GUI-managed `automations.yaml`; graduate complex
ones into packages later.

---

## 7. Naming conventions (binding — see `docs/01-naming-conventions.md`, lock before Phase 2)

- **Location tokens** (closed list, lowercase): `office, bedroom, living,
  kitchen, bath, garage, hall, outdoor`. Every device gets the room it sits in.
- **Roles** (closed list): `air, temp, motion, presence, contact, light, relay,
  env, power, leak`.
- **Hostname** (ESPHome `name:`): `esp-<location>-<role>` → `esp-office-air`
  (DNS-safe, hyphens, lowercase).
- **Multi-function node** = one device (role `air`/`env`); the **measurement**
  disambiguates: `sensor.office_air_co2`, `sensor.office_air_pm25`, …
- **Entity IDs**: `<domain>.<location>_<role>_<measurement>` (underscores).
  Hyphens in hostnames, underscores in entity_ids.
- **HA areas**: Title Case (`Office`, `Living Room`).
- **Z2M friendly_name** mirrors the scheme (`living_light_ceiling`) — **rename at
  pairing time**, never leave the `0x00124b…` default.
- **Stability rules:** hostnames/sensor names **frozen once adopted**; **units
  frozen** (long-term statistics break on unit changes); new roles/locations
  added to the doc in the same PR.

---

## 8. Data layer — what to record where

| Store | Purpose | Retention | Contents |
|---|---|---|---|
| **Recorder (MariaDB)** | HA history/logbook UI | **short: 7–10 days** | most things briefly; `exclude` noisy entities |
| **Long-Term Statistics** | hourly min/mean/max | ~forever (tiny) | numeric sensors w/ `state_class`; free, automatic |
| **InfluxDB 2.x** | high-res charts, Grafana | per-bucket (e.g. 90 d) | a **curated `include:` allowlist** only |

- **Never forward everything to InfluxDB** — use the `include:` allowlist or it
  bloats. Recorder `exclude` is independent of Influx forwarding.
- **Allowlists stay explicit (per-entity), not globs** — a glob like
  `sensor.*_air_*` would silently sweep in the per-node diagnostics
  (`*_air_uptime`, `*_air_wifi_signal` from `common/base.yaml`), which is
  exactly the bloat the allowlist exists to prevent. Accepted cost: every new
  node adds a few lines to `packages/influxdb.yaml` + `packages/homekit.yaml`
  in the same PR (the device registry in `docs/01-naming-conventions.md` lists
  the expected entities). Revisit (e.g. a CI drift check) if this becomes
  painful past ~20 nodes.
- LTS covers "last year of CO2" for free; Grafana/Influx for rich, annotated,
  cross-metric dashboards.
- Influx: org + bucket + **read-only token for Grafana** + write token for HA.

---

## 9. Apple Home / HomeKit (HomePod is central)

- **HomePod = always-on Home Hub + Thread border router:** remote control + Siri
  + Apple-side reachability with **no exposed ports** (via iCloud — independent of
  Tailscale). Two independent remote paths = resilience.
- **Curate exposure with `homekit: include_entities`** (allowlist, never deny);
  watch the **~150-accessory/bridge limit**; expose control + canonical sensors
  (lights, switches, climate, motion, contact, temp/humidity, native **Air
  Quality / CO2 / VOC** tiles). Numeric "data" entities → Grafana, not Apple Home.
- **Native Apple Home tiles:** map PM2.5/VOC → Air Quality, CO2 → Carbon Dioxide
  (with high-CO2 alert), temp/humidity → native tiles.
- **Pairing is fragile state:** **freeze entity unique_ids before pairing**;
  changing them shows "No Response"/duplicates and forces redoing Apple-side
  rooms/automations. Pairing lives in `.storage` → backup, not git.
- **Resilience boundary:** HA-bridged devices still depend on HA being up; only
  **native-HomeKit firmware** or **directly-commissioned Matter** survive an HA
  outage — reserve that for anything truly critical.

---

## 10. Dashboards — hosted locally, reached from anywhere

**Hosting stays local — no Railway, no cloud DB.** HA (Lovelace) + Grafana run on
the mini PC; their value is local data (HA's live state + InfluxDB history) that
never has to leave home. Railway can't see your LAN data without you tunneling out
anyway, and Grafana Cloud's free tier keeps only **~14 days** of history — so local
hosting wins on **retention + privacy**, and there's **no custom app to build**.
- **HA dashboards (Lovelace):** everyday at-a-glance + control; best via the HA
  Companion app (native feel, widgets, Watch).
- **Grafana:** deep-history charts off InfluxDB; **embeddable into HA dashboards**.
- **Wall tablet** in kiosk mode for an always-on panel; start with HA-native
  history/LTS cards and lean on Grafana as data grows.

**Reach them from any device, anywhere → Cloudflare Tunnel + Access** (reuses the
Cloudflare account you already have):
- The **`cloudflared` HA add-on** opens an **outbound-only** tunnel to Cloudflare's
  edge — **no router ports opened, no public IP exposed** — publishing dashboards
  at e.g. `grafana.<yourdomain>` / `ha.<yourdomain>`.
- **Cloudflare Access (Zero Trust)** puts an **identity gate** (Google SSO or
  one-time-PIN email) in front, so unauthenticated traffic never reaches the
  origin. Open the URL in **any browser on any device** → log in → dashboards.
- One-time HA tweak to sit behind the proxy: `http: use_x_forwarded_for: true` +
  `trusted_proxies:` = the add-on's subnet.

**Cloudflare Tunnel + Access vs Tailscale — how they compare (and why you run both):**

| | **Cloudflare Tunnel + Access** | **Tailscale** |
|---|---|---|
| What it is | App proxy via Cloudflare's edge (public hostname) | WireGuard **mesh VPN** (private, device-to-device) |
| Client on the viewing device? | **None — any browser** | **Client required** (or a Funnel URL; ports 443/8443/10000) |
| Public exposure | Public hostname, but **gated by Access**; origin has no open ports | **Zero** (private mesh); Funnel = public but app's-own-auth only |
| Auth | Identity gate at the edge (SSO/PIN), per request | Device joined to your tailnet (WireGuard) + ACLs |
| Encryption / privacy | TLS **terminated at CF edge** → Cloudflare *can* see the traffic | **End-to-end** WireGuard; even relays see only ciphertext |
| Best for | "Open my dashboard on **any device**, share a link" | Admin/SSH/LAN reach + the **HA Companion app** |

- **Why both, not either/or:** the **HA Companion app doesn't render the Cloudflare
  Access login page**, so Access breaks the *app* (browsers are fine). So:
  **Cloudflare → browser dashboards on any device; Tailscale → the Companion app +
  full admin/LAN.** They complement cleanly.
- **Trade-off you're accepting:** Cloudflare terminates TLS at its edge, so it can
  technically see your dashboard traffic (Tailscale can't). Fine for a home
  dashboard, and Access keeps strangers out — and it's *why the data stays local
  and only the view is proxied*.

**Build order:** LAN + Tailscale work from Phase 1; add the Cloudflare Tunnel +
Access once dashboards exist (Phase 7, or earlier if you want it sooner).

---

## 11. Thread / Matter & radio strategy

- **Now:** ESPHome native API (WiFi) for DIY + **Zigbee** (via Z2M) for the
  low-power mesh. ESPHome Thread is early; native Matter immature.
- **One radio per protocol:** running Zigbee + Thread on a single stick is still
  unreliable in 2026 — so the ZBT-2 runs **Zigbee only**.
- **Thread/Matter path:** your **HomePod is already a Thread border router**, so
  Matter-over-Thread devices can join Apple Home today; Matter is **multi-admin**
  (one device pairs to Apple Home **and** HA, bypassing the bridge). For HA-native
  Thread, add a **second, dedicated Thread radio** (or HA's OTBR) later.
- **Hedge cheaply** with a couple of **ESP32-C6** boards; **revisit** when ESPHome
  Matter matures or you buy a commercial Matter device.

---

## 12. Backups, power & monitoring

**Backups (layered):** **Proxmox VM snapshots** (host-level, fast rollback) +
**HA Supervisor backups** (nightly partial: `/config` + Z2M + Mosquitto + Influx
+ MariaDB; weekly full) + **off-site copy**. Retention: 7 daily + 4 weekly local;
4 weekly off-site. **Off-site:** Google Drive Backup add-on (recommended) or
rclone→NAS/B2. **Encrypt backups** (they hold secrets + the Zigbee network key).
**Do a restore drill in Phase 7.**

**Power:** **UPS** + **NUT add-on** for graceful shutdown (protects MariaDB/Influx
from corruption on unclean power loss).

**Monitoring (`packages/monitoring.yaml`):** fleet-wide stale/disconnect
detection (`sensor.stale_air_nodes` + `binary_sensor.air_fleet_problem` — one
node list drives both; adding a node = adding one name), low-battery (Zigbee),
**NVMe free-space**, UPS state — via HA Companion push.

**Watch the watcher:** every alert above flows through HA — if HA itself is
down, nothing fires. Phase 7 adds an **external dead-man's switch**: a
Healthchecks.io ping automation, or an **Uptime Kuma LXC on the Proxmox host**
(fits the "few extras as LXCs" design) probing HA from outside the VM.

**Updates:** HA Core / HA OS / add-ons update independently and are not atomic.
**Don't auto-update Core**; update ~monthly after skimming "backward-incompatible
changes"; **back up (and snapshot) before any update.**

---

## 13. CI / validation (GitHub Actions, lightweight, PR-triggered, path-filtered)

- **`esphome-validate.yml`:** `pip install esphome==$(cat .esphome-version)` →
  `esphome config esphome/*.yaml`. Copy `esphome/secrets.yaml.example` →
  `secrets.yaml` in the workflow (dummy values). `config` validates schema
  without compiling (fast).
- **`ha-check.yml`:** `python -m homeassistant --script check_config -c .` in the
  official HA Docker image, **pinned via the `.ha-version` file**; same
  secrets-from-example trick; fail only on config errors.
- **Version pins are single-sourced** in `.ha-version` / `.esphome-version` at
  the repo root — when you upgrade HA or the ESPHome add-on, edit the file (the
  workflows read it), keeping CI validating what production actually runs.
- **`lint.yml`:** `yamllint` (config in `.yamllint.yml`) + **gitleaks** secret
  scan over full history on every PR/push — catches a token pasted into a
  *tracked* file, the failure mode `.gitignore` can't.
- **`upgrade-canary.yml`:** weekly scheduled run of both checks against the
  **latest** HA image / ESPHome release (ignoring the pins). A red run = an
  upcoming upgrade will break config — fix *before* upgrading. Never blocks PRs.
- The validate pair is the **gate** for the auto-deploy pipeline (§4): the
  cloud validates fast; the self-hosted LAN runner compiles + OTAs only on success.
  Heavy ESPHome compiles happen at deploy time on the runner (cached), not here.
- Keep minimal: no compile-on-every-PR, no version matrix.

---

## 14. Phased roadmap (each phase has a verifiable Definition of Done)

- **Phase 0 — Repo scaffolding (no hardware):** create the tree; `.gitignore`;
  `*.example` templates; `docs/00-architecture.md` + `01-naming-conventions.md`;
  CI skeletons. **DoD:** private repo on GitHub, naming doc complete, first 3
  devices named on paper, CI files exist.
- **Phase 1 — Proxmox + HA OS VM + base + git + Tailscale + network:** install
  **Proxmox** on the mini PC; create the **HA OS VM** (the community helper-script
  or official image); **USB-passthrough** plan ready (stick arrives Phase 5); set
  timezone/verify clock; install Advanced SSH + Studio Code Server + Tailscale +
  **MariaDB** add-ons; `git init` in `/config` + push; DHCP reservation; **IoT
  VLAN + mDNS reflector + firewall rules**; UPS + NUT; take the first **Proxmox
  snapshot + HA backup**. **DoD:** HA reachable on LAN **and** via Tailscale;
  `git push` works; recorder on MariaDB; clock correct; snapshot + backup exist.
- **Phase 2 — ESPHome base + first air node:** ESPHome add-on; `common/base.yaml`
  (wifi `!secret`, encrypted `api:`, `ota:`, `time: homeassistant`, status/uptime/
  wifi sensors); air node config (SCD41 via I²C); flash USB once then
  OTA; adopt, assign area, name per §7; stale-sensor stub. **DoD:**
  `sensor.<room>_air_co2` live; connection sensor "connected"; **OTA works**; CI green.
  *Note (air-quality session):* the kitchen full node additionally needs the
  **new `sensors_air_full.yaml` design (sgp4x + pmsx003/PMS7003 on a `uart:` bus)** —
  see §17. The SCD41-only bedroom/living nodes (orig. Phase 6) reuse the existing
  `sensors_common.yaml` and can be built alongside the kitchen.
- **Phase 3 — Apple Home:** `packages/homekit.yaml` w/ explicit tiny
  `include_entities`; confirm HomePod is Home Hub; **freeze unique_ids first**;
  pair bridge; assign rooms. **DoD:** AQ/CO2 accessory in Apple Home; test toggle
  reflects in HA ≤1 s; Siri via HomePod; pairing documented as fragile state.
- **Phase 4 — InfluxDB + Grafana + first chart:** install both add-ons; org/
  bucket/retention + read-only Grafana token; `packages/influxdb.yaml` w/
  **`include:` allowlist**; Grafana provisioning + first dashboard. **DoD:** live
  CO2 chart from Influx; only allowlisted entities in Influx; recorder retention
  short; LTS populating.
- **Phase 5 — Mosquitto + Zigbee2MQTT + first bulb:** **ZBT-2** on USB-2 extension,
  **passed through by Device ID**; Mosquitto add-on + MQTT user; Z2M add-on (serial
  by-id, chosen Zigbee channel clear of WiFi) → Mosquitto; mirror Z2M config to
  repo; pair bulb, **rename immediately**; add light to HomeKit allowlist. **DoD:**
  bulb controllable from HA **and** Apple Home; **independence test** (§15) passes.
- **Phase 6 — Automations + dashboards:** first real automations (motion→light,
  high-CO2→notify); `dashboards/overview.yaml`; finalize Grafana AQ dashboard;
  expand ESP nodes via shared base. **DoD:** ≥2 automations fire on real triggers;
  overview shows all rooms; CI green.
- **Phase 7 — Backups + monitoring + secure remote access + hardening:** Supervisor
  auto-backups + off-site + Proxmox snapshot policy; finalize `monitoring.yaml`;
  NUT/UPS graceful shutdown; **`cloudflared` add-on → Cloudflare Tunnel + Access**
  for browser dashboards (set HA `trusted_proxies`; Access policy = your identity);
  lock down (no inbound ports — only the outbound tunnel + Tailscale; services
  otherwise LAN-only); backup + recovery runbooks. **DoD:** **restore drill**
  succeeds; pulling a sensor's power fires the stale alert; off-site copy verified;
  UPS triggers graceful shutdown; **Grafana/HA open via the Cloudflare URL on a
  phone off-WiFi behind the Access login, and the HA Companion app works via Tailscale.**
- **Phase 8 — Automated push-to-deploy (CI/CD):** stand up the **self-hosted GitHub
  Actions runner** (isolated Proxmox LXC, label `home-lan`); add `deploy.yml`
  (config sync + HA-API reload + staged ESPHome OTA with change-detection, canary,
  and health check); store deploy secrets as GitHub Actions secrets; firewall the
  runner to HA + IoT OTA only; document `git revert` rollback. **DoD:** a one-line
  edit pushed to `main` from off-network (e.g., GitHub mobile) validates in cloud,
  deploys OTA to the affected device(s) via the LAN runner, and passes the
  post-deploy health check; a deliberately-bad push validates-then-skips and alerts.

---

## 15. Verification strategy (manual, deterministic)

- **Host/HA (P1):** loads on LAN; loads on cellular via Tailscale; recorder shows
  MariaDB; clock correct; Proxmox snapshot + HA backup exist.
- **Sensor live (P2):** state updates on interval; **breathe near the CO2 sensor →
  value rises in ~30–60 s**; OTA an update successfully.
- **Apple Home (P3):** accessory shows live AQ/CO2; test toggle flips HA ≤1 s;
  Siri via HomePod; **on cellular, control works through the HomePod**.
- **InfluxDB (P4):** Data Explorer shows points tagged by `entity_id`; Grafana
  updates; a **non-allowlisted entity is absent** from Influx; LTS lists the sensor.
- **Lights survive HA (P5):** restart **HA Core** → bulb returns **without
  re-pairing** (Z2M/Mosquitto kept running); **bind a Zigbee remote directly to the
  bulb** → press it **with HA Core stopped** → bulb still toggles; reboot host →
  Z2M reconnects via by-id without edits.
- **Automations (P6):** trigger each condition physically; confirm action + "last
  triggered" + Logbook.
- **Backups/monitoring (P7):** unplug a node → stale alert; backup exists locally
  **and** off-site; **restore drill** keeps Zigbee net + (re-)establishes HomeKit;
  UPS → "on battery" → graceful shutdown; **on cellular, Grafana opens via the
  Cloudflare URL (Access login) and the HA app works via Tailscale**.
- **End-to-end:** walk into office → motion turns on a Zigbee light → CO2 climbs →
  iPhone notified → view the spike in Grafana → turn light off via Siri/HomePod.
  All five links = integrated.

---

## 16. Critical files to create first (Phase 0, in order)

1. `docs/01-naming-conventions.md` — binding; **before** any device (avoids entity churn).
2. `.gitignore` — gates what secrets/state reach GitHub; before first push.
3. `esphome/common/base.yaml` — the DRY foundation every node inherits.
4. `packages/homekit.yaml` — the curated `include_entities` allowlist (the #1 footgun).
5. `packages/influxdb.yaml` — the Influx `include:` allowlist + recorder/LTS/Influx split.

---

## 17. Open items to confirm during implementation (minor; have recommendations)

- **Air sensor model — RESOLVED (air-quality planning session):** tiered, all SCD41-based.
  - **Kitchen (`esp-kitchen-air`) — full:** SCD41 (CO2/T/RH) + PMS7003 (PM1/2.5/10, UART) + SGP41 (VOC+NOx, I²C).
  - **Bedroom + Living — reduced:** SCD41 only.
  - Chose discrete PMS7003 + SGP41 over the all-in-one SEN5x (~$40–50) for the same metrics at lower cost. BOM: `docs/03-bill-of-materials.md`.
  - **BUILT.** `esphome/common/sensors_air_full.yaml` = `sgp4x` (VOC+NOx index) +
    `pmsx003` (`type: PMSX003` — the generic ESPHome type that covers the PMS7003).
    `esp-kitchen-air.yaml` includes both modules plus a `uart:` bus (GPIO16/17);
    bedroom/living reuse `sensors_common.yaml` (SCD41) unchanged. Shared board +
    I²C bus config (SCD41 `0x62` + SGP41 `0x59`, no conflict) lives in
    `esphome/common/device_esp32.yaml`. InfluxDB/HomeKit allowlists and
    `dashboards/air-quality.yaml` carry the PM2.5 / VOC / NOx entities; CI's
    entity-drift check (`scripts/check-entity-drift.py`) keeps them honest.
- **HA OS VM creation method:** community Proxmox helper-script vs official VM image. *Rec:* whichever is current/most-maintained at build time.
- **Off-site backup target:** Google Drive add-on (rec) vs NAS/B2.
- **Zigbee channel** selection vs your WiFi channels (decide before mass pairing).
- **Deploy trigger style:** branch→PR→merge (validation-gated, *recommended*) vs
  direct push to `main` (`deploy.yml` still `needs:` validate). Either gives
  push-to-deploy.
- **OTA rollout shape:** canary + batch size (default: 1 canary, then small batches)
  and the per-device health-check timeout.
- **Dashboard domain:** which Cloudflare-managed domain/subdomains to use
  (`grafana.<domain>`, `ha.<domain>`) — a subdomain of your existing app's domain is fine.
- **Cloudflare Access identity:** Google SSO vs one-time-PIN email (*rec:* SSO if you
  have a Google account, PIN as a simple start), and whether to also gate Grafana
  with Access or rely on Grafana's own login.
- **Companion-app remote path:** via Tailscale (*rec*) vs a Cloudflare Access service
  token (advanced).

---

## 18. Future features — backlog (post-Phase 8, prioritized)

Device/automation features live here; the **infra-side roadmap** (network
services + monitoring on the Proxmox host) is `docs/09-roadmap.md`.

From the 2026-06 audit (`docs/08-audit-2026-06.md`). The naming registry
(§7) already reserves the roles these need (`presence`, `power`, `leak`,
`motion`) — adding them means new hardware + a registry entry, no renames.
Rough order of value:

1. **mmWave presence nodes** (`esp-<room>-presence`, LD2410/LD2450 + ESP32,
   ~$8/node) — true occupancy (PIR fails on "sitting still at a desk");
   unlocks the genuinely useful automations: lights/climate follow occupancy,
   "office occupied + CO2 high → ventilate" nudges. Fits the existing ESPHome
   DRY pattern (`common/base.yaml`) unchanged.
2. **Energy monitoring** (`power` role) — start with 2–3 Zigbee **metering
   plugs** (per-appliance, pairs with the Phase 5 mesh); later a CT-clamp
   node (e.g. Emporia Vue 2 reflashed to ESPHome) for whole-home. Feeds HA's
   built-in Energy dashboard for free; InfluxDB + Grafana is the showcase
   for this data.
3. **Air-quality-driven actuation** — close the loop on the existing sensors:
   kitchen PM2.5 spike → metering plug switches the air purifier on / push
   "run the range hood"; bedroom CO2 high before sleep → notify. One Zigbee
   plug + two automations; highest payoff-per-line-of-YAML in the backlog.
4. **Local voice — HA Assist / Voice PE** (~$59) — fully local
   Whisper + Piper pipeline. Strongest local-first complement to Siri: Siri
   only sees the HomeKit allowlist (§9); Assist sees everything in HA.
5. **Leak sensors** (`leak` role, Zigbee, ~$15–20 ea: washer/sink/water
   heater) — boring, highest ROI-per-dollar in home automation; the notify
   group (`packages/notifications.yaml`) is already waiting.
6. **Wall-tablet kiosk dashboard** — dedicated Lovelace view (§10 already
   plans the tablet); the feature that gets non-technical household members
   using the system.
7. ~~**Derived comfort metrics** (dew point, absolute humidity)~~ — **done**,
   `packages/comfort.yaml` (config-only, no hardware).
8. **External dead-man's switch for HA itself** (§12 "watch the watcher") —
   schedule with Phase 7 hardening.
