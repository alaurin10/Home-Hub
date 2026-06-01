# Proxmox host — notes (no secrets)

The mini PC runs **Proxmox VE**; Home Assistant runs as an **HA OS VM** on it,
leaving room for a few isolated LXCs (Pi-hole, Node-RED, the Phase 8 deploy
runner, a later Frigate NVR). See docs/00-architecture.md §1 and §3.

## VM: Home Assistant OS

| Setting | Value (starting point) |
|---|---|
| vCPU | 2–4 |
| RAM | 4–8 GB |
| Disk | 64–100 GB (on NVMe) |
| Machine | q35, OVMF (UEFI) |

## USB passthrough (the ZBT-2 Zigbee coordinator) — Phase 5

- Pass through **by Device ID** (`/dev/serial/by-id/...`), **not** by port, so
  reboots / re-enumeration don't break Zigbee.
- For maximum mesh stability, consider PCI-passthrough of the USB controller.
- Keep the stick on a **USB-2 extension cable** away from the chassis / NVMe / AP.

## Snapshot policy

- Take a Proxmox **snapshot before any HA Core / add-on / OS update**.
- Snapshots are host-level fast rollback; they complement (do not replace) HA
  Supervisor backups + the off-site copy. See §12.

## Deploy runner (Phase 8)

- Run the self-hosted GitHub Actions runner in an **isolated LXC** (label
  `home-lan`), with firewall access to only the HA VM (SSH + API) and the IoT
  VLAN OTA ports. See §4.
