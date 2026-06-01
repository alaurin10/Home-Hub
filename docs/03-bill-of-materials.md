# 03 — Bill of Materials (buy per phase)

See `docs/00-architecture.md` §2 for rationale.
See `docs/02-bootstrap-proxmox-haos.md` §A for detailed purchasing notes and sources.

## Phase 1 — host + power

| Item | Best price | Source | Notes |
|---|---|---|---|
| **Beelink EQ12 Pro** (N305, 16 GB, 500 GB NVMe) | ~$179 | Amazon B0CCXZMZWL | Dual 2.5 GbE; recommended pick |
| Alt: Trigkey Key N150 (16 GB, 500 GB) | ~$139–149 | Amazon | Budget pick if $179 is too much |
| **CyberPower CP550SLG** UPS 550 VA | ~$55–65 | Amazon / Newegg | User-replaceable battery; recommended |
| Alt: APC BE425M 425 VA | ~$35–45 | Amazon / Walmart | Non-replaceable battery; cheaper |

**Phase 1 total: ~$214–244**

## Phase 2 — first ESP32 sensor

| Item | Best price | Source | Notes |
|---|---|---|---|
| **SCD40 CO2 sensor bare module** | ~$14–15 | **AliExpress** (order early, 3–4 wk) | 65% cheaper than Adafruit; search "SCD40 breakout" |
| Alt: Adafruit SCD-40 #5187 | ~$44.95 | adafruit.com | STEMMA QT; often out of stock |
| Alt: Seeed Grove SCD41 | ~$25–30 | seeedstudio.com | SCD41 slightly more accurate; Grove connector |
| ESP32 WROOM-32 38-pin dev board × 2 | ~$13–15 (5-pack) | Amazon DORHEA B08MQ647ZG | ~$3/board; buy 5, use 2, keep 3 as spares |
| ESP32-C6 DevKitC-1-N8 × 1–2 | ~$10–12 | Amazon B0BRMSDR4R or DigiKey (~$8) | Optional Thread hedge |
| Breadboard 830-tie + jumper wires kit | ~$10–13 | Amazon Smraza B01HRR7EBG | M-M, M-F, F-F wires included |
| USB-C cable × 3 | ~$3–6 | Amazon | 5 V power for ESP32 boards; standard cables |
| USB 5V 2–3A charger × 2 | ~$12–18 (3-pack) | Amazon | Phone chargers work too |

**Phase 2 total: ~$63–119 (AliExpress SCD40) or ~$93–149 (Adafruit)**

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

---

## Add-ons (free, no hardware cost)

MariaDB, Mosquitto, Node-RED, Pi-hole, InfluxDB, Grafana, Tailscale, cloudflared,
ESPHome, Advanced SSH, Studio Code Server, NUT, Z2M.

---

## Total build estimate

| Scope | Total |
|---|---|
| Phase 1 only (minimum) | ~$214–244 |
| Phase 1 + 2 (first sensor, AliExpress SCD40) | ~$277–363 |
| Full build through Phase 5 | ~$311–429 |
