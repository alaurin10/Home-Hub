# 09 — Roadmap: network services & infra monitoring

> Forward plan from the July 2026 analysis session. Scope was set explicitly:
> this is an **apartment** deployment — cameras/NVR, water-main shutoff valves,
> and whole-home CT-clamp energy monitoring are **out**. What's in: making the
> existing Proxmox host earn its keep with **network services** and
> **infrastructure monitoring** — the "who watches the watcher" layer the
> audit (`docs/08-audit-2026-06.md` finding 1) deferred. Device/automation
> features stay in the §18 backlog of `docs/00-architecture.md`; this doc is
> the infra side.

**Resource reality check** (`proxmox/README.md`): ~10 GB of 16 GB RAM and
~76 GB of 128 GB disk are allocated to the three existing guests. Everything
below fits comfortably in the remainder — each LXC needs 256–512 MB RAM and
2–4 GB disk. Nothing here forces the 500 GB SSD upgrade.

---

## N. Network services

> **Pulled forward (July 2026):** remote *browser* access to the dashboards no
> longer waits on anything in this section — the **Cloudflare Tunnel + Access**
> milestone (docs/00 §10, Phase 7) ships alongside the custom dashboard app
> instead, per `docs/10-remote-access.md`. N1–N3 below remain the **LAN-side and
> admin** story (local names, internal TLS, tailnet reach); they're unchanged.

### N1 — Finish the Pi-hole LXC (already planned; do first)

The LXC is designed (`proxmox/README.md`) but not yet live. Nothing else in
this doc depends on it, but internal hostnames (N2) are much nicer once local
DNS exists.

- Static IP; router DHCP hands out Pi-hole as DNS.
- **Local DNS records** for every service: `pve.home.arpa`, `ha.home.arpa`,
  `kuma.home.arpa`, … — this is what makes N2's reverse proxy usable without
  memorizing ports.
- **Sole-DNS risk** (already flagged in `proxmox/README.md`): Pi-hole down =
  internet "down" for the household. Mitigations, pick one: (a) accept it —
  it's an LXC on a UPS-backed host, restart is one command; (b) router hands
  out a public secondary (filtering becomes partial); (c) later, a second
  tiny DNS LXC. Start with (a), revisit after the first unplanned outage.
- **DoD:** ads blocked on a phone with no per-device config; `dig ha.home.arpa`
  resolves; Pi-hole survives a host reboot unattended.

### N2 — Reverse proxy LXC with internal TLS (Caddy)

Today every service is `ip:port` over plain HTTP. One small LXC running
**Caddy** puts them all behind `https://<name>.home.arpa`.

- **Caddy over Nginx Proxy Manager**: NPM is UI-configured state (the same
  config-drift problem `docs/08` flags for Grafana); a **Caddyfile is
  config-as-code** — commit it in this repo under `caddy/`, deploy like
  everything else. Caddy's `internal` TLS issuer gives padlocked HTTPS on the
  LAN with one line; install its root CA on your devices once (or, if you own
  a real domain, use DNS-01 for a wildcard cert and skip the CA install).
- Routes: `ha.` → HA VM :8123, `kuma.` → the N3 LXC, `pve.` → :8006,
  `pihole.` → Pi-hole admin.
- HA needs `use_x_forwarded_for` + the proxy's IP in `trusted_proxies`
  (`configuration.yaml` already holds the cloudflared subnet from Phase 7;
  N2 adds this proxy's IP alongside it).
- **DoD:** every service reachable at `https://<name>.home.arpa` with no
  browser warning; committed Caddyfile is the only route config.

### N3 — Tailscale subnet router (remote access, still zero inbound ports)

The architecture keeps Tailscale for the Companion app + admin (docs/00
§10/§12, as an HA add-on); dashboards-in-a-browser go via the Cloudflare
Tunnel instead (`docs/10-remote-access.md`). A **subnet-router LXC** is the
admin upgrade: advertise the LAN subnet so *everything* (Proxmox UI, Uptime
Kuma, SSH) is reachable remotely — not just HA — while keeping the
no-inbound-ports rule.

- Tiny LXC, `tailscale up --advertise-routes=192.168.1.0/24`; approve the
  route in the admin console. Advertise Pi-hole as the tailnet DNS server and
  `*.home.arpa` names work remotely too.
- Keep the HA add-on as a fallback path (two doors, one vendor) or drop it
  once the subnet router is proven — decide during Phase 7.
- **DoD:** on cellular, `https://pve.home.arpa` loads and `ssh pve` works;
  no port-forwards exist on the router.

### N4 — Segmentation, apartment-scaled (honesty item)

docs/00 §3 assumes a VLAN-capable router for the IoT VLAN. In an apartment
with ISP/consumer gear that may never materialize. The fallback that captures
most of the value:

- ESP nodes + future Zigbee devices on the router's **guest/IoT SSID** (client
  isolation from your laptops/phones), DHCP reservations for every node.
- Caveat the guest-SSID path shares with the VLAN design: ESPHome discovery
  and OTA need mDNS or direct IP routing — if the guest network blocks them,
  set `use_address:` (static IPs) per node rather than weakening isolation.
- If/when VLAN-capable gear arrives, docs/00 §3 applies unchanged.
- **DoD (either path):** an IoT device cannot reach the Proxmox UI or SSH;
  HA still reaches every node's API + OTA port.

---

## M. Infra monitoring

### M1 — Uptime Kuma LXC (the outside watcher)

Everything in `packages/monitoring.yaml` flows THROUGH Home Assistant — its
own NOTE says so. Uptime Kuma on the **host, outside the HA VM**, closes that
loop (this is the exact fix deferred by audit finding 1).

| Monitor | Type | Catches |
|---|---|---|
| HA `http://<ha>:8123/api/` | HTTP (expect 401) | HA Core down/hung |
| Mosquitto `<ha>:1883` | TCP | broker down → Zigbee dead |
| Dashboard app `/api/health` | HTTP | custom dashboard down |
| Pi-hole | DNS query | DNS down (the "internet is broken" pager) |
| Proxmox `https://<pve>:8006` | HTTP | host UI/API |

- **Notification channel must not depend on HA**: ntfy.sh (or a self-hosted
  ntfy container on the Docker VM) or plain SMTP → phone. Never
  `notify.notify_group` — that's the dependency we're escaping.
- **DoD:** stop the HA VM → phone notification within 2 min, sent by nothing
  that lives inside the HA VM.

### M2 — Dead-man's switch (Healthchecks.io)

Uptime Kuma watches from inside the LAN; if the whole host or the internet
connection dies, nothing fires. Two free Healthchecks.io checks close the
last gap and directly resolve the NOTE in `packages/monitoring.yaml` and
audit finding 1:

- **`ha-alive`** — a `time_pattern` automation + `rest_command` in a new
  `packages/deadman.yaml` pings the check URL every 5 min. Missed pings →
  Healthchecks emails/pushes you. Covers HA, the VM, the host, and the ISP in
  one signal.
- **`backup-ok`** — pinged by the nightly backup job as its final step
  (`docs/04-runbook-backups.md`); a backup that silently stops running is the
  failure mode you only otherwise discover during a restore.
- **DoD:** pull the host's network cable → external alert within ~10 min;
  disable the backup job for a day → `backup-ok` alert.

### M3 — HA System Monitor + alert wiring (closes the monitoring.yaml TODO)

The TODO at the bottom of `packages/monitoring.yaml`: add the **System
Monitor** integration (UI config entry), then alert on its entities in the
package — disk >85% (recorder DB growth is the usual culprit on a 48 GB
disk), memory pressure. Pattern to copy: the existing `air_fleet_problem`
automation (persistent notification + notify group).

### M4 — NUT when the UPS lands

Unchanged from docs/00/§12 and the BOM: UPS → NUT integration → "on battery"
alert + graceful shutdown. Listed here only so the monitoring story has its
last piece visible.

---

## Small sensor add-ons (kept deliberately thin)

Hardware interest is currently low; these are the only additions that pull
their weight in an apartment, all riding the Phase 5 Zigbee mesh when it
exists (see §18 backlog for details — no new design work needed):

- **Leak sensor** under the kitchen sink (+ washer if in-unit) — backlog #5;
  the cheapest insurance in home automation.
- **1–2 contact sensors** (front door, a window that matters for rain).
- **mmWave presence** (backlog #1) — only once a concrete automation wants it.

---

## Suggested order & budget

| # | Item | New guest? | RAM | Cost | Prereq |
|---|---|---|---|---|---|
| 1 | N1 Pi-hole | LXC (planned) | 512 MB | $0 | Phase 1 host |
| 2 | M1 Uptime Kuma | LXC | 256–512 MB | $0 | Phase 1 host |
| 3 | M2 dead-man's switch | no (HA package + backup hook) | — | $0 | HA live (Phase 1) |
| 4 | N2 Caddy | LXC | 256 MB | $0 | N1 (names) |
| 5 | N3 Tailscale subnet router | LXC | 256 MB | $0 | — |
| 6 | M3 System Monitor wiring | no | — | $0 | HA live |
| 7 | N4 segmentation pass | no | — | $0 | — |
| 8 | M4 NUT | no | — | UPS (~$55) | UPS purchase |

Worst case adds ~1.5 GB RAM across four LXCs against ~6 GB free. Items 1–3
deliver the most safety per hour of effort; 4–6 are quality-of-life; 7–8
complete the story.

**Related:** the custom dashboard app (`apps/dashboard/`, July 2026) deploys as
a compose stack when the Docker host VM lands — it's a `ha.`/`dash.` hostname
candidate for N2, an HTTP monitor candidate for M1, and gets its public
`dash.<domain>` URL via the Cloudflare Tunnel (`docs/10-remote-access.md`,
last section).
