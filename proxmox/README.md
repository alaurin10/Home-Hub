# Proxmox host — notes (no secrets)

The mini PC (**HP EliteDesk 600 G3 Mini** · i5-7500T · 16 GB · 128 GB SSD) runs
**Proxmox VE**. Three guests run on it. See `docs/00-architecture.md` §1 and §3 for
rationale, and the step-by-step build in `docs/02-bootstrap-proxmox-haos.md` §C.

## Guest topology

```
Proxmox host
├── VM:  Home Assistant OS    ← the appliance (Supervisor / add-ons)
├── VM:  Docker host (Debian) ← garmin-mcp + Garmin dashboard (separate compose stacks)
└── LXC: Pi-hole              ← network-wide DNS filtering
```

| Guest | Type | vCPU | RAM | Disk | Notes |
|---|---|---|---|---|---|
| Home Assistant OS | VM | 2 | 4 GB | 48 GB | q35 + OVMF (UEFI); the appliance |
| Docker host | VM | 2 | 4 GB | 24 GB | Debian 12 + Docker; app stacks live here |
| Pi-hole | LXC | 1 | 512 MB | 4 GB | unprivileged Debian 12 LXC |

~10 GB of 16 GB RAM and ~76 GB of 128 GB disk allocated — leaves headroom for ISOs,
snapshots, and local HA backups. Disks are thin-provisioned and **can be grown later**.
If a disk-hungry service (e.g. a Frigate NVR) is added, revisit a 500 GB SSD upgrade.

## VM: Home Assistant OS

| Setting | Value (starting point) |
|---|---|
| vCPU | 2 |
| RAM | 4 GB |
| Disk | 48 GB (on the SSD) |
| Machine | q35, OVMF (UEFI) |

## VM: Docker host

- Debian 12 VM running **Docker Engine + Compose**. Hosts containerized apps as **separate
  `docker compose` stacks**: the migrated **garmin-mcp** (+ future MCP servers) and the custom
  **Garmin insights dashboard** (FastAPI + React + sync job + DB).
- **Docker in a VM, not an LXC** — full kernel isolation; the supportable path. (Proxmox
  doesn't support Docker-in-LXC; nesting weakens isolation and breaks on kernel/systemd updates.)
- App code lives in **separate repos** cloned onto this VM — **not** in this repo (which maps to
  HA's `/config`). Synced **health data is gitignored**.
- Give it a **static IP**. The garmin-mcp is reached via the existing **Cloudflare Tunnel**
  (a `cloudflared` container/route points here) — no inbound ports opened.

## LXC: Pi-hole

- Unprivileged Debian 12 LXC running **Pi-hole natively** (no Docker). Network-wide DNS
  ad/tracker filtering for the whole LAN.
- **Static IP** (DNS depends on it); set the router's DHCP "DNS server" to this IP.
- Isolated from the apps so a container problem never takes down DNS. Sole-DNS = full
  filtering but a dependency — keep it up, or add a public secondary (then filtering is partial).

## USB passthrough (the ZBT-2 Zigbee coordinator) — Phase 5

- Pass through **by Device ID** (`/dev/serial/by-id/...`), **not** by port, so
  reboots / re-enumeration don't break Zigbee.
- For maximum mesh stability, consider PCI-passthrough of the USB controller.
- Keep the stick on a **USB-2 extension cable** away from the chassis / NVMe / AP.

## Snapshot policy

- Take a Proxmox **snapshot before any HA Core / add-on / OS update**.
- After first build, snapshot **each guest** (`phase1-baseline-ha`, `-pihole`, `-docker`).
- Snapshots are host-level fast rollback; they complement (do not replace) HA Supervisor
  backups + the off-site copy. See §12.

## Deploy runner (Phase 8)

- Run the self-hosted GitHub Actions runner in an **isolated LXC** (label `home-lan`), with
  firewall access to only the HA VM (SSH + API) and the IoT VLAN OTA ports. See §4.
