# 03 — Bill of Materials (buy per phase)

See `docs/00-architecture.md` §2 for rationale.
See `docs/02-bootstrap-proxmox-haos.md` §A for detailed purchasing notes and sources.

## Phase 1 — host + power

> **Host settled — nothing to buy.** The original recommendation was a new
> Beelink EQ12 Pro (N305) / Trigkey N150; instead a **reused HP EliteDesk 600
> G3 Mini** (i5-7500T, 16 GB, 128 GB SSD) became available and is the Proxmox
> host (`proxmox/README.md`). VM disk sizes in `docs/02` were trimmed to fit
> the 128 GB drive. Only the UPS remains on the Phase 1 list.

| Item | Best price | Source | Notes |
|---|---|---|---|
| Host: **reused HP EliteDesk 600 G3 Mini** | $0 | on hand | i5-7500T, 16 GB, 128 GB SSD |
| **CyberPower CP550SLG** UPS 550 VA | ~$55–65 | Amazon / Newegg | User-replaceable battery; recommended |
| Alt: APC BE425M 425 VA | ~$35–45 | Amazon / Walmart | Non-replaceable battery; cheaper |

**Phase 1 total: ~$35–65** (UPS only)

## Phase 2 / 6 — air-quality sensor nodes (3 rooms)

Decided in the air-quality planning session: **3 ESP32 nodes ordered together**
to get ahead on long-lead AliExpress parts. Tiered coverage for a small
apartment — full air quality in the kitchen (cooking smoke/VOC), CO2 + climate
in the bedroom and living room.

- **Kitchen (`esp-kitchen-air`) — full:** SCD41 + PMS7003 + SGP41
- **Bedroom (`esp-bedroom-air`) — reduced:** SCD41 only
- **Living (`esp-living-air`) — reduced:** SCD41 only

Sensor metrics: SCD41 = true CO2 + temp + humidity; PMS7003 = PM1/2.5/10;
SGP41 = VOC index + NOx index. The cheap PMS7003 + SGP41 pair replaces the
all-in-one SEN55 (~$40–50) for the same metrics (T/RH comes from the SCD41).
SCD4x = I²C `0x62`, SGP4x = I²C `0x59` (no conflict); PMS7003 is UART.

| Item | Qty | Best price | Source | Notes |
|---|---|---|---|---|
| **SCD41 CO2/temp/humidity bare module** | 3 | ~$14–16 ea | **AliExpress** (order early, 3–4 wk) | One per node; search "SCD41 breakout". SCD41 > SCD40 (slightly more accurate). |
| **PMS7003 laser PM sensor** (PM1/2.5/10, UART) | 1 | ~$15–19 | **AliExpress** (long lead) | Kitchen only; slim form factor, ships with ribbon cable. |
| **SGP41 VOC+NOx module** (I²C) | 1 | ~$6–10 | **AliExpress** (long lead) | Kitchen only; VOC index + NOx index. SGP40 ~$5 if VOC-only ever acceptable. |
| ESP32 WROOM-32 38-pin dev board | 5-pack | ~$12–15 | Amazon DORHEA B08MQ647ZG | ~$3/board; use 3, keep 2 spares. (PSoC 6 rejected — no ESPHome target.) |
| Breadboard 830-tie + jumper wires kit | 1 | ~$10–13 | Amazon Smraza B01HRR7EBG | Bench bring-up before final assembly; M-M/M-F/F-F wires. |
| USB-C cable × 3 | 3 | ~$3–6 | Amazon | 5 V power for ESP32 boards. |
| USB 5V 2–3A charger | 3 | ~$9–12 (3-pack) | Amazon | **5 V matters** — kitchen PMS7003 fan runs off the board's 5 V/VIN rail. Phone chargers work. |
| Vented ABS project box (pre-made) | 3 | ~$2–5 ea | **AliExpress** | No printer needed; ensure airflow over the kitchen PM inlet. |

**Phase 2/6 air-node total: ~$97–134** (≈$80 reusing chargers/breadboard you own).
Kitchen gas/PM is ~$21–29 (PMS7003 + SGP41) vs ~$40–50 for a SEN55.

> Note: this consolidates what the architecture roadmap split across Phase 2
> (first node) and Phase 6 (living + bedroom) — all three air nodes are bought
> in one order. Office (`esp-office-air`) is unchanged in the registry and not
> part of this purchase.

## Phase 5 — Zigbee coordinator + first bulb

| Item | Best price | Source | Notes |
|---|---|---|---|
| **HA Connect ZBT-2** coordinator | **~$21** | cloudfree.shop (verify) | Check CloudFree first; Amazon ASIN B0G34ZTW51 = $49–65 |
| **USB 2.0 extension cable 1–2 m** | ~$5–7 | Amazon Basics B00NH136GE | **CRITICAL: USB 2.0, not 3.0** — USB 3 RF noise kills Zigbee |
| **Sengled A19 E26 Zigbee bulb × 1–2** | ~$8–10 each | Amazon B074K427TZ (8-pack ~$35) | IKEA TRADFRI discontinued 2026; Sengled is the reliable alt |

**Phase 5 total: ~$34–66**

## Phase 6 — automations hardware (optional)

| Item | Best price | Source | Notes |
|---|---|---|---|
| Zigbee motion sensor (e.g., SONOFF SNZB-03P) | ~$8–15 each | Amazon | For motion→light automations |
| Zigbee contact sensor | ~$8–15 each | Amazon | Door/window automations |

## Phase 7 — backups (off-site, ongoing)

| Item | Cost | Notes |
|---|---|---|
| Google Drive (15 GB free) | **$0/mo** | Enough for HA backups with Google Drive Backup add-on |
| Google One (100 GB) | ~$2/mo | If backups exceed 15 GB |

## Future / backlog (post-Phase 8 — see `docs/00-architecture.md` §18)

| Item | Qty | ~Price | Notes |
|---|---|---|---|
| LD2410B mmWave presence module + ESP32 | per room | ~$8/node | True occupancy (`esp-<room>-presence`); LD2450 (~$12) adds multi-target tracking |
| Zigbee metering smart plug | 2–3 | ~$15 ea | Per-appliance energy + AQ-driven actuation (purifier on PM2.5 spike) |
| Zigbee leak sensor | 2–3 | ~$15–20 ea | Washer / sink / water heater; highest ROI-per-dollar |
| HA Voice Preview Edition | 1 | ~$59 | Fully local voice (Whisper + Piper); complements Siri |
| Emporia Vue 2 (reflash to ESPHome) | 1 | ~$80 | Whole-home CT-clamp energy, later |
| Wall tablet (used/refurb) | 1 | ~$50–120 | Kiosk dashboard, optional |

---

## Add-ons (free, no hardware cost)

MariaDB, Mosquitto, Node-RED, Pi-hole, InfluxDB, Grafana, Tailscale, cloudflared,
ESPHome, Advanced SSH, Studio Code Server, NUT, Z2M.

---

## Total build estimate

| Scope | Total |
|---|---|
| Phase 1 only (minimum) | ~$214–244 |
| Phase 1 + all 3 air nodes (kitchen full + bedroom/living SCD41) | ~$311–378 |
| Full build through Phase 5 (incl. Zigbee) | ~$345–444 |
