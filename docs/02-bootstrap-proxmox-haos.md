# 02 — Bootstrap: Proxmox + Home Assistant OS (Phase 1)

> Runbook skeleton — flesh out with exact values (IPs, VLAN IDs, device IDs) as
> you execute Phase 1. See docs/00-architecture.md §1, §3, §5.

## 1. Proxmox VE on the mini PC
- [ ] Install Proxmox VE; set a static management IP; update.
- [ ] Confirm VT-x/VT-d (for later USB/PCI passthrough).

## 2. Home Assistant OS VM
- [ ] Create the HA OS VM (community helper-script **or** official VM image — pick
      whichever is current/best-maintained; see §17 open items).
- [ ] Specs: 2–4 vCPU, 4–8 GB RAM, 64–100 GB disk on NVMe, q35 + OVMF/UEFI.
- [ ] Boot HA, complete onboarding, **set timezone & verify the clock**.

## 3. Network (do NOT skip — silently breaks discovery)
- [ ] **IoT VLAN** for ESP/Zigbee gear; **DHCP reservations by MAC**.
- [ ] **mDNS reflector** (Avahi) across VLANs, or give the HA VM an IoT-VLAN leg.
- [ ] Firewall: IoT→HA (6053, 5353), HA→IoT (OTA/API), HomePod+iPhone→HA;
      block IoT→main LAN.

## 4. Core add-ons
- [ ] Advanced SSH & Web Terminal, Studio Code Server.
- [ ] **Tailscale** (verify remote reachability).
- [ ] **MariaDB** (recorder backend → see `packages/recorder.yaml`).

## 5. Git
- [ ] `git init` in `/config`; add this repo as `origin`.
- [ ] Auth via SSH deploy key or fine-grained PAT (scoped to this private repo).
- [ ] `cp secrets.yaml.example secrets.yaml` and fill in; same for
      `esphome/secrets.yaml`. Confirm `.gitignore` keeps secrets/state out.
- [ ] First commit + push; confirm CI runs.

## 6. Power
- [ ] UPS connected; **NUT add-on** configured for graceful shutdown.

## 7. First safety net
- [ ] Take the first **Proxmox snapshot** + **HA Supervisor backup**.

**DoD:** HA reachable on LAN **and** via Tailscale; `git push` works; recorder on
MariaDB; clock correct; snapshot + backup exist.
