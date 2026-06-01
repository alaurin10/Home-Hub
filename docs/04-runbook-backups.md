# 04 — Runbook: Backups (Phase 7)

> See docs/00-architecture.md §12. Skeleton — confirm targets/retention as you set
> this up.

## Layers (no single layer is enough)
1. **Proxmox VM snapshots** — host-level, fast rollback. **Before every** HA Core /
   add-on / OS update.
2. **HA Supervisor backups** — nightly **partial** (`/config` + Z2M + Mosquitto +
   InfluxDB + MariaDB); weekly **full**.
3. **Off-site copy** — Google Drive Backup add-on (recommended) or rclone → NAS/B2.

## Retention
- Local: **7 daily + 4 weekly**.
- Off-site: **4 weekly**.

## Encryption
- **Encrypt all backups** — they contain `secrets.yaml` **and** the Zigbee network
  key. Store the backup passphrase somewhere safe and off-box.

## What's covered where
- **git** = authored config (this repo).
- **Backups** = runtime state: `.storage/` (incl. **HomeKit pairing**), recorder
  DB, **Zigbee network DB / coordinator backup**, Influx/MariaDB data + tokens.
- **Snapshots** = whole-VM rollback.

## Checklist
- [ ] Supervisor automatic backups scheduled (partial nightly, full weekly).
- [ ] Off-site target configured + first upload verified.
- [ ] Proxmox snapshot policy documented in `proxmox/README.md`.
- [ ] Backup passphrase recorded off-box.
- [ ] **Restore drill** performed (see `05-runbook-recovery.md`).
