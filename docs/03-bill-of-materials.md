# 03 — Bill of Materials (buy per phase)

See docs/00-architecture.md §2 for rationale.

| Item | Phase | ~USD | Notes |
|---|---|---|---|
| N150/N305 mini PC (16–32 GB, ~500 GB NVMe) | 1 | $180–300 | Proxmox + HA OS VM + a few LXCs |
| **UPS 350–600 VA** | 1 | $55–90 | Protects DBs from unclean power loss; enables NUT shutdown |
| ESP32 dev board (WROOM-32 / S3) ×2 | 2 | $6–12 ea | Buy 2 (spare/dev) |
| 1–2× ESP32-**C6** (Thread hedge) | 2 | $6–10 ea | Optional; keeps Thread door open |
| Air sensor: **SCD40** or **SEN5x** | 2 | $20–60 | SCD40 = true CO2 cheap; SEN5x = PM+VOC+NOx+RH+T |
| Breadboard + jumpers; USB-C cables + 5 V PSUs ×2–3 | 2 | $20–40 | First wiring + power |
| **HA Connect ZBT-2** Zigbee coordinator | 5 | $30–40 | Dual-chip; native HA support (ZBDongle-P ~$25 = budget alt) |
| **USB 2.0 extension cable (1–2 m)** | 5 | $6–9 | Critical anti-interference (USB2, not 3) |
| Zigbee bulb(s) (IKEA/Hue/Sonoff) ×1–2 | 5 | $10–18 ea | IKEA = cheap, Z2M-friendly |
| Zigbee motion/contact sensors (optional) | 6 | $8–15 ea | For automations |
| Off-site backup storage (cloud) | 7 | ~$0–6/mo | Google Drive free tier likely enough |

Add-ons (MariaDB, Mosquitto, Node-RED, Pi-hole, InfluxDB, Grafana, Tailscale,
cloudflared) are **free** — no hardware cost.

**First cart (Phases 1–2): ~$260–420.** Add the Zigbee kit at Phase 5.
