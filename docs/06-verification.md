# 06 — Verification (manual, deterministic)

> The Definition-of-Done checks per phase. See docs/00-architecture.md §14–§15.

## Phase 0 — scaffolding
- [ ] Private repo on GitHub; this tree pushed.
- [ ] Naming doc complete; **first 3 devices named** (`01-naming-conventions.md`).
- [ ] CI workflow files exist (`esphome-validate.yml`, `ha-check.yml`, `deploy.yml`).
- [ ] `lint.yml` (yamllint + gitleaks) green on a PR; `upgrade-canary.yml` runs
      green via manual dispatch (Actions → upgrade-canary → Run workflow).

## Phase 1 — host/HA
- [ ] HA loads on LAN **and** on cellular via Tailscale.
- [ ] Recorder shows MariaDB; clock correct.
- [ ] First Proxmox snapshot + HA backup exist.

## Phase 2 — first sensor
- [ ] State updates on interval; **breathe near the CO2 sensor → value rises in
      ~30–60 s**.
- [ ] Connection sensor "connected"; **OTA an update successfully**; CI green.
- [ ] Unplug a node → `binary_sensor.air_fleet_problem` turns **on** within
      ~10 min and `sensor.stale_air_nodes` names the room; replug → clears.
- [ ] Comfort sensors plausible: `sensor.<room>_air_dew_point` below room temp;
      `sensor.<room>_air_absolute_humidity` roughly 5–15 g/m³ indoors.

## Phase 3 — Apple Home
- [ ] Accessory shows live AQ/CO2; test toggle flips HA ≤1 s.
- [ ] Siri via HomePod; **on cellular, control works through the HomePod**.

## Phase 4 — removed (July 2026)
~~InfluxDB + Grafana~~ — superseded by the custom dashboard app (`apps/dashboard/`);
see its own test suite + `apps/dashboard/README.md` instead of a phase checklist here.

## Phase 5 — Zigbee independence
- [ ] Restart **HA Core** → bulb returns **without re-pairing**.
- [ ] **Bind a Zigbee remote directly to the bulb** → press with HA Core stopped →
      bulb still toggles.
- [ ] Reboot host → Z2M reconnects via by-id without edits.
- [ ] **Anonymous MQTT connect is refused** (`mosquitto_sub` with no credentials
      fails — see `mosquitto/README.md` hardening).
- [ ] With ACLs on, the `zigbee2mqtt` user **cannot** read/publish outside
      `zigbee2mqtt/#`.

## Phase 6 — automations
- [ ] Trigger each condition physically; confirm action + "last triggered" + Logbook.

## Phase 7 — backups / monitoring / remote access
- [ ] Unplug a node → stale alert fires.
- [ ] Backup exists locally **and** off-site; **restore drill** passes.
- [ ] UPS → "on battery" → graceful shutdown.
- [x] On cellular: **the dashboard app opens via the Cloudflare URL (Access
      login)** — verified 2026-07-22, `ha.<domain>` and `dash.<domain>` both
      reachable off-WiFi. HA Companion app / Tailscale leg still to confirm.

## Phase 8 — auto-deploy
- [ ] One-line edit pushed to `main` (e.g., from GitHub mobile) validates in cloud,
      deploys OTA to the affected node via the LAN runner, passes health check.
- [ ] A deliberately-bad push **validates-then-skips** deploy and alerts.

## End-to-end (integration)
- [ ] Walk into office → motion turns on a Zigbee light → CO2 climbs → iPhone
      notified → view the spike in the dashboard app → turn light off via
      Siri/HomePod.
