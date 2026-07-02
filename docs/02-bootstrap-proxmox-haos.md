# 02 — Phase 1: Detailed Setup Guide
## Proxmox + Home Assistant OS + Pi-hole + Docker host + Network + Add-ons + Git

> See `docs/00-architecture.md` §1, §3, §5 for design rationale.
> Fill in your exact values (IPs, VLAN IDs, MAC addresses) as you work through this.

---

## A. Hardware to buy

> **SUPERSEDED (host):** the mini-PC purchase below never happened — the
> Proxmox host is a **reused HP EliteDesk 600 G3 Mini** (i5-7500T, 16 GB,
> 128 GB SSD); see `proxmox/README.md` and §B2 below, which is written for it.
> The UPS advice still applies. Kept for reference if the host is ever replaced.

### Primary hardware (Phase 1)

#### Mini PC — the Proxmox host

**Best pick: Beelink EQ12 Pro (N305) — ~$179 on Amazon (ASIN B0CCXZMZWL)**

The N305 (8-core, 3.8 GHz boost) runs 6–15 W idle and handles Proxmox + HA +
MariaDB + InfluxDB + a few LXCs with headroom. The dual 2.5 GbE port makes IoT
VLAN isolation easy without a USB NIC.

**Minimum spec:**
- CPU: Intel N100 / N150 / N305 (4–8 core, low TDP — avoid N95: only 2-core)
- RAM: **16 GB** (32 GB if <$20 delta)
- Storage: **500 GB NVMe SSD** (never eMMC — too slow for MariaDB/InfluxDB writes)
- Ports: USB-A × 3+, HDMI/DP, ethernet × 1–2

| Model | CPU | Price | Notes |
|---|---|---|---|
| **Beelink EQ12 Pro** ← recommended | N305 | **~$179** Amazon | Dual 2.5 GbE; best all-round |
| GMKtec NucBox G3 | N300 | ~$169 Amazon | Comparable; less community testing |
| Trigkey Key N150 | N150 | ~$139–149 Amazon | Budget pick; fine for HA-only |
| MINISFORUM UM350 | Ryzen 5 3550H | ~$220–250 Amazon | Overkill unless adding Frigate NVR |

> AliExpress is NOT cheaper here — these brands already ship from China via Amazon FBA
> at the same price as their AliExpress stores, and Amazon gives you returns + faster shipping.

#### UPS — protects MariaDB and InfluxDB from unclean power loss

**Best pick: CyberPower CP550SLG — ~$55–65 on Amazon/Newegg**
Budget alternative: **APC BE425M — ~$35–45 on Amazon/Walmart**

| Model | VA/W | Price | Notes |
|---|---|---|---|
| **CyberPower CP550SLG** ← recommended | 550 VA / 330 W | **~$55–65** | **User-replaceable battery** (batteries last 3–5 yr); 8 outlets |
| APC BE425M | 425 VA / 255 W | ~$35–45 Amazon | Non-replaceable battery; reliable; cheaper upfront |
| CyberPower CP425SLG | 425 VA / 255 W | ~$40–55 Walmart | Good but harder to find new in 2026 |

Prefer the CP550SLG — the user-replaceable battery saves buying a new UPS in 4 years.
USB cable to connect to the mini PC is included in the box (plug-and-play with NUT).

#### Other Phase 1 accessories (if you don't have them)

| Item | Where | Notes |
|---|---|---|
| USB flash drive, 8 GB+ | Any store | For Proxmox installer |
| HDMI cable + monitor/TV | Any store | One-time; can use a TV |
| Ethernet cables × 2 | Any store | Mini PC to router/switch; Cat5e or Cat6 |

---

### Phase 2 hardware (order now to have ready)

**SCD40 tip: order from AliExpress now** — it's 65% cheaper and will arrive by the time
you finish Phase 1. Everything else is close enough in price that Amazon is worth it.

| Item | Best price | Where | Notes |
|---|---|---|---|
| **SCD40 CO2 sensor bare module** | **~$14–15** | AliExpress | Order now — 3–4 week shipping; search "SCD40 breakout" |
| SCD40 breakout (if you want it now) | ~$44.95 | Adafruit #5187 | STEMMA QT; plug-and-play; often out of stock |
| Seeed Grove SCD41 | ~$25–30 | seeedstudio.com | SCD41 is slightly more accurate; Grove connector |
| **ESP32 WROOM-32 5-pack** | **~$13–15** | Amazon (DORHEA B08MQ647ZG or AITRIP) | ~$3/board; buy 38-pin narrow version |
| ESP32-C6 DevKitC-1-N8 | ~$10–12 | Amazon B0BRMSDR4R or DigiKey (~$8) | Optional Thread hedge |
| **Breadboard + jumper wires kit** | **~$10–13** | Amazon (Smraza B01HRR7EBG) | Includes M-M, M-F, F-F wires + breadboard |
| USB-C 5V 3A charger × 2 | ~$12–18 (3-pack) | Amazon | Standard phone chargers work too |

**Approximate Phase 2 cost:** ~$60–100 (AliExpress SCD40) or ~$90–130 (Adafruit SCD40).

---

### Phase 5 hardware (buy when ready for Zigbee)

| Item | Best price | Where | Notes |
|---|---|---|---|
| **HA Connect ZBT-2** | **~$21** | cloudfree.shop (verify price) | Check CloudFree first; Amazon lists ~$49–65 (ASIN B0G34ZTW51) |
| **USB 2.0 extension cable, 1–2 m** | **~$5–7** | Amazon Basics B00NH136GE | **CRITICAL: USB 2.0, not 3.0** — USB 3 RF noise kills Zigbee range |
| **Zigbee bulb (Sengled A19 E26)** | **~$8–10 each** | Amazon B074K427TZ (8-pack ~$35) | Non-routing; stable with Z2M; IKEA TRADFRI being discontinued in 2026 |

> **IKEA TRADFRI note (2026):** IKEA discontinued the TRADFRI line and is switching to
> Matter/Thread "Kajplats" bulbs. Use **Sengled** for reliable Zigbee test devices.

---

### Full budget summary

| Cart | Items | Total |
|---|---|---|
| Phase 1 only | Mini PC + UPS (CP550SLG) | **~$234–244** |
| Phase 1 + 2 | Above + ESP32 + SCD40 (AliExpress) + breadboard/PSU | **~$307–357** |
| Phase 1 + 2 + 5 | Above + ZBT-2 (CloudFree) + USB ext + Sengled bulb | **~$343–393** |

---

## B. Proxmox VE installation

### B1. Download and flash the Proxmox installer to a USB stick

**Download the ISO:**
1. On any computer, go to `https://www.proxmox.com/en/downloads` → **Proxmox Virtual
   Environment** → download the latest **Proxmox VE ISO Installer** (currently the 9.x
   branch, ~1.3 GB; built on Debian 13 "trixie"). Use the newest stable release — there's
   no reason to install the older 8.x branch on a fresh build.
2. *(Recommended)* Verify the download isn't corrupt — the download page lists a SHA-256
   checksum next to the file:
   - **Windows (PowerShell):** `Get-FileHash .\proxmox-ve_*.iso -Algorithm SHA256`
   - **macOS/Linux:** `shasum -a 256 proxmox-ve_*.iso`
   - The printed hash must match the website's. (A bad ISO = a failed/odd install.)

**Flash it to the USB stick (8 GB+). Pick ONE method:**

> ⚠️ Flashing **erases the entire USB stick.** Back up anything on it first, and
> double-check you're selecting the USB — not your computer's own disk.

**Option A — Balena Etcher (easiest; Windows/macOS/Linux):**
1. Get Etcher from `https://etcher.balena.io`, install, and open it.
2. **Flash from file** → select the Proxmox ISO.
3. **Select target** → choose your USB stick (verify by size).
4. **Flash!** → wait for "Flash Complete", then eject.

**Option B — Rufus (Windows):**
1. Get Rufus from `https://rufus.ie` and open it.
2. **Device** → your USB stick. **Boot selection** → the Proxmox ISO.
3. **Partition scheme: GPT**, **Target system: UEFI**.
4. **START** → if it asks about "ISOHybrid image", choose **Write in DD Image mode** → OK.

**Option C — `dd` (macOS/Linux; advanced):**
1. Identify the USB device **carefully** — the wrong name wipes that disk:
   - **Linux:** `lsblk` (find your stick by size, e.g. `/dev/sdb`)
   - **macOS:** `diskutil list` (e.g. `/dev/disk4`), then `diskutil unmountDisk /dev/disk4`
2. Write it (replace `sdX` / `diskN` with YOUR device):
   - **Linux:** `sudo dd if=proxmox-ve_*.iso of=/dev/sdX bs=4M status=progress oflag=sync`
   - **macOS:** `sudo dd if=proxmox-ve_*.iso of=/dev/rdiskN bs=4m && sync`
3. Eject when it finishes.

### B2. Prepare the BIOS and boot from the USB (HP EliteDesk 600 G3 Mini)

Two goals: (a) enable virtualization so Proxmox can run VMs, and (b) boot the USB stick.
The keys below are for the **HP EliteDesk 600/800 G3 Mini**; other machines differ (often
`F2`/`Del` for BIOS setup, `F7`/`F11`/`F12` for the one-time boot menu).

1. Plug the USB stick, an HDMI monitor, a USB keyboard, and ethernet into the mini PC.
   Power it on.
2. **Enter BIOS setup:** tap **`F10`** repeatedly at the HP splash screen.
3. **Enable virtualization** (required for VMs/LXCs):
   - **Advanced → System Options** (or **Security → System Security** on some versions):
     - **Virtualization Technology (VTx)** → **Enabled**
     - **Virtualization Technology for Directed I/O (VTd)** → **Enabled**
       *(needed for USB passthrough of the Zigbee stick in Phase 5)*
4. **Boot mode:** **Advanced → Boot Options** → ensure **UEFI** is on (not Legacy/CSM).
5. **Secure Boot:** Proxmox VE supports it, but if the installer refuses to boot, come
   back here (**Advanced → Secure Boot**) and **disable** it.
6. **Save & exit:** **`F10`** → **Yes**. The PC reboots.
7. **Boot the USB:** as it powers back on, tap **`F9`** for the **boot menu** → select the
   USB stick (often shown as "UEFI: <USB brand>").
   - Not listed? Re-check the flash (B1) and try a **rear USB port** (most reliable).

### B3. Install Proxmox

1. After the USB boots (B2), the Proxmox menu appears → select
   **"Install Proxmox VE (Graphical)"**.
2. Accept the EULA → choose the **target disk = your internal SSD** (the 128 GB drive —
   **NOT** the USB stick). Install **erases** that disk; confirm it's the right one.
3. **Country / Timezone / Keyboard:** set your real timezone (it flows into HA later).
4. **Password + email:** strong root password; email can be real or throwaway (used for alerts).
5. **Management network:**
   - Hostname (FQDN): `pve.home.arpa` (or `pve.local` — pick one and keep it)
   - IP: a **static IP** on your main LAN (e.g., `192.168.1.10/24`)
   - Gateway: your router IP (e.g., `192.168.1.1`)
   - DNS: `1.1.1.1`
6. Review → **Install** (5–10 min) → **Reboot**, and **remove the USB stick** as it restarts.
7. From any browser on your LAN, open `https://192.168.1.10:8006`:
   - "Certificate not trusted" is normal (self-signed) → proceed/accept.
   - Log in: user **`root`**, your password, Realm **"Linux PAM"**.

### B4. Post-install Proxmox config

**Switch to the no-subscription repo (required if no Proxmox subscription):**

> **PVE 9 changed the repo file format** — it's now `deb822` (`.sources` files), not the
> old one-line `.list` format. The commands below are for **PVE 9 (trixie)**. If you ended
> up on PVE 8 instead, see the fallback at the end of this block.

**Easiest — GUI:** Node (left sidebar) → **Updates → Repositories** → click **Add** →
select **No-Subscription** → also click on the `pve-enterprise` entry → **Disable**.

**Or via Shell** (Node → **Shell**):
```bash
# Disable the enterprise repo (PVE 9 / deb822 format)
sed -i '$a Enabled: false' /etc/apt/sources.list.d/pve-enterprise.sources

# Add the no-subscription repo
cat > /etc/apt/sources.list.d/pve-no-subscription.sources << 'EOF'
Types: deb
URIs: http://download.proxmox.com/debian/pve
Suites: trixie
Components: pve-no-subscription
Signed-By: /usr/share/keyrings/proxmox-archive-keyring.gpg
EOF
```

> **PVE 8 fallback (old `.list` format, "bookworm"):**
> ```bash
> sed -i 's|^deb https://enterprise.proxmox.com|# deb https://enterprise.proxmox.com|' \
>     /etc/apt/sources.list.d/pve-enterprise.list
> echo "deb http://download.proxmox.com/debian/pve bookworm pve-no-subscription" \
>     > /etc/apt/sources.list.d/pve-no-subscription.list
> ```

**Update Proxmox:**
```bash
apt update && apt full-upgrade -y
```
(Reboot if the kernel updated: `reboot`)

**Dismiss the "no valid subscription" nag (optional):**
```bash
sed -Ezi "s/(Ext.Msg.show\(\{[^}]*title: gettext\('No valid subscription'\))/void(\1/g" \
    /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js
systemctl restart pveproxy
```

**Confirm VT-x/VT-d is enabled** (needed later for USB passthrough):
```bash
grep -E 'vmx|svm' /proc/cpuinfo | head -1
dmesg | grep -E 'IOMMU|iommu'
```
If VT-d shows nothing, reboot into BIOS (**`F10`** on the HP) and enable **VTx + VTd** (see B2).

---

## C. Create the guests (HA VM + Pi-hole LXC + Docker host VM)

> Three guests run on Proxmox. **Home Assistant** is a full VM (it's an appliance);
> **Pi-hole** is a lightweight LXC; the **Docker host** is a small VM that will later run
> your containerized apps (garmin-mcp + the Garmin dashboard). Sized to fit the **128 GB
> SSD** with room for snapshots/backups:

| Guest | Type | vCPU | RAM | Disk | Created in |
|---|---|---|---|---|---|
| Home Assistant OS | VM | 2 | 4 GB | 48 GB | C1–C3 |
| Pi-hole | LXC | 1 | 512 MB | 4 GB | C4 |
| Docker host (Debian) | VM | 2 | 4 GB | 24 GB | C5 |

> **Docker runs inside a VM, not an LXC** — Proxmox doesn't support Docker-in-LXC, and
> nesting weakens isolation + breaks on kernel/systemd updates. A small Debian VM is the
> supportable path with full kernel isolation.

### C1. Create the VM with the community helper script

The fastest and most reliable method is the Proxmox community helper script
(maintained at `github.com/community-scripts/ProxmoxVE` after tteck's passing):

In the Proxmox **Shell**, run:
```bash
bash -c "$(wget -qLO - https://github.com/community-scripts/ProxmoxVE/raw/main/vm/haos-vm.sh)"
```

The script prompts:
- **Default settings? → Yes** (creates 2 vCPU / 4 GB RAM / 32 GB disk / q35 / OVMF)
- Or choose **Advanced** and set: 4 vCPU, 4–8 GB RAM, 64 GB disk, q35, OVMF (recommended)

The script downloads the latest HA OS image and creates the VM automatically.

> **Alternative (manual):** download the `.qcow2` KVM image from the HA GitHub releases
> page and import it via `qm importdisk`. The helper script is easier.

### C2. Configure the VM

After the script completes, find the new VM in the sidebar (usually VM ID 100+).

**Set resources to fit the 3-guest budget** (Hardware tab):
- Processors: 2 (plenty for HA; leaves cores for the other guests — easy to raise later)
- Memory: 4096 MB (HA is comfortable in 4 GB; the rest is reserved for the Docker VM + Pi-hole)
- Hard Disk: 48 GB (select disk → Disk Action → Resize). Thin-provisioned; grow it later if needed.

**Note the VM ID** (you'll need it for USB passthrough in Phase 5).

### C3. Boot and onboard HA

1. **Start the VM** (right-click → Start, or the Start button).
2. Open the Console tab — watch it boot.
3. On another device, navigate to `http://homeassistant.local:8123` (mDNS) or
   `http://[VM_IP]:8123`. First boot takes 3–8 minutes.
4. Click **"Create my smart home"** to begin onboarding.
5. **Name, username, password** — use a real password.
6. **Location:** set your exact address (or close enough) — this drives sunrise/sunset automations.
7. **Timezone:** verify it matches your actual timezone.
8. **Analytics:** your choice; fine to decline.
9. Complete onboarding; you'll land on the main dashboard.

**Verify time:**
Settings → System → General → scroll to "System time" — must show current local time.

**Note your HA version:**
Settings → System → About → e.g. `Home Assistant 2026.5.3`
→ Update `ha-check.yml` with `2026.5` (the `YYYY.M` part).

### C4. Pi-hole LXC (the second guest)

Pi-hole gives network-wide ad/tracker blocking via DNS. It runs **natively in a tiny Debian
LXC** — no Docker needed.

**Create it with the community helper script (easiest):**
1. Proxmox UI → select your node (`pve`) → **Shell**.
2. Grab the current Pi-hole LXC command from **`https://community-scripts.github.io/ProxmoxVE/`**
   (search "Pi-hole"), or run:
   ```bash
   bash -c "$(wget -qLO - https://github.com/community-scripts/ProxmoxVE/raw/main/ct/pihole.sh)"
   ```
3. Choose **Default**, or **Advanced** to set: unprivileged LXC, Debian 12,
   **1 vCPU, 512 MB RAM, 4 GB disk**.
4. At the end the script prints the **LXC IP** and the **admin URL** — note them.

**Give it a fixed address + set the password:**
5. Give the LXC a **static IP** (or a DHCP reservation on your router) so it never moves —
   DNS depends on it.
6. Set the admin password: select the LXC → **Console** → `pihole setpassword`.
7. Open `http://<pihole-ip>/admin` → log in.

**Point your network at Pi-hole (so it actually filters):**
8. On your router, set the **DHCP "DNS server" option to the Pi-hole IP** (covers every
   device). Apply, then renew a lease / reboot a device to pick it up.
   - **Reliability note:** Pi-hole as the *only* DNS = full filtering but a dependency — if
     the LXC is down, DNS stops. It's very stable; keep it running, or add a public secondary
     DNS and accept that some queries then bypass filtering.

**Verify:**
9. From a device now using Pi-hole — normal sites resolve, and a known ad domain is blocked:
   ```bash
   nslookup doubleclick.net <pihole-ip>     # should return 0.0.0.0 (blocked)
   ```
   The admin **Query Log** should show live traffic.

> **Manual alternative:** create a Debian 12 LXC from a template, then run the official
> installer inside it: `curl -sSL https://install.pi-hole.net | bash`.

### C5. Docker host VM (the third guest)

A small Debian VM running Docker. It stays **empty for now** — later phases `git clone` your
garmin-mcp and Garmin-dashboard repos here and bring each up with `docker compose`.

**Create the Debian VM:**
1. **Easiest** — community **Debian VM** helper script: grab the current command from
   **`https://community-scripts.github.io/ProxmoxVE/`** (search "Debian VM") and run it in the
   Proxmox **Shell**. Set **2 vCPU, 4 GB RAM, 24 GB disk**, and a **static IP**.
2. **Manual alternative** — download the **Debian 12 netinstall ISO**
   (`https://www.debian.org/distrib/`), upload it (Datacenter → your storage → ISO Images →
   Upload), create a VM (q35 / OVMF, 2 vCPU, 4 GB, 24 GB), and install Debian with the
   **SSH server** + **standard system utilities** options ticked.

**Install Docker (inside the VM — Console or SSH):**
3. Install Docker Engine + the Compose plugin via Docker's official script:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER        # run docker without sudo (log out/in after)
   ```
4. Verify:
   ```bash
   docker run hello-world               # prints a success message
   docker compose version               # v2 Compose is included
   ```

**Leave it ready:**
5. *(Optional)* install **Tailscale** for remote admin:
   `curl -fsSL https://tailscale.com/install.sh | sh`.
6. Done — the VM is ready and empty. The **garmin-mcp migration** and the **Garmin dashboard
   build** are separate later phases (each its own repo, deployed here; the MCP server gets
   exposed via your existing **Cloudflare Tunnel** — point a `cloudflared` container/route at
   this VM then, no inbound ports).

> Health data the Garmin app syncs must be **gitignored** — the code is shareable, your data isn't.

---

## D. Network — IoT VLAN (do this before any ESP32 work)

> This section is router/firewall dependent. Common setups covered below.
> If you skip this, mDNS/ESPHome discovery will silently fail across VLANs.

### D1. What you need

- **IoT VLAN** (e.g., VLAN ID 20, subnet `192.168.20.0/24`)
- **DHCP on IoT VLAN** (router serves addresses in the 192.168.20.x range)
- **mDNS reflector** across VLANs (Avahi, or a second NIC for HA)
- **Firewall rules:**
  - IoT → HA: allow TCP 6053 (ESPHome API), UDP 5353 (mDNS), TCP 1883 (MQTT in Phase 5)
  - HA → IoT: allow TCP 6053 (OTA), TCP 3232 (OTA alt), TCP 80 (ESPHome fallback)
  - IoT → Main LAN: **BLOCK** (ESP32 firmware isn't hardened)
  - Main LAN / Tailscale → HA: allow (for your devices)

### D2. VLAN setup by router type

**Unifi Dream Machine / Dream Router:**
1. UniFi Controller → Networks → Create New Network
2. Name: `IoT`, VLAN Only: ✅, VLAN ID: `20`
3. Enable DHCP: ✅, IP Range: `192.168.20.0/24`, Gateway: `192.168.20.1`
4. Firewall → LAN Firewall Rules → add rules per D1 above
5. Enable Avahi (mDNS): Settings → Multicast DNS → Enable (or use a separate Avahi LXC)

**OPNsense / pfSense:**
1. Interfaces → VLANs → Add (parent = your LAN interface, tag = 20)
2. Interfaces → Assignments → assign new VLAN interface → enable, set IP `192.168.20.1/24`
3. Services → DHCPv4 → [IoT interface] → enable, range `192.168.20.100`–`.200`
4. Firewall → Rules → IoT → add rules per D1 above
5. For mDNS: Services → Avahi → Enable (or install `avahi` package)

**OpenWRT:**
1. Network → Interfaces → Add new (name: `iot`, protocol: static, bridge over `vlan.20`)
2. Network → DHCP → add DHCP for `iot` interface
3. Network → Firewall → Zones → add `iot` zone; set rules per D1
4. Install `avahi-daemon` for mDNS: `opkg install avahi-daemon`

**Simpler alternative — give HA VM a second NIC:**
In Proxmox, add a second network interface to the HA OS VM (Hardware → Add → Network Device)
bridged to your IoT VLAN bridge. HA then has one foot in each network and mDNS/discovery
just works without a reflector. This is the simplest path if VLANs feel complex.

### D3. DHCP reservations

Once you have ESP32 boards (Phase 2), give each one a static IP by MAC address.
Naming: `esp-<location>-<role>` → e.g., `esp-office-air` = `192.168.20.11`.

Document your reservations here as you add devices:
```
# IoT VLAN DHCP reservations (fill in as you add devices)
# 192.168.20.10  esp-office-air       <MAC>
```

---

## E. Core add-ons

Install these via **Settings → Add-ons → Add-on Store** (search each by name).

### E1. Advanced SSH & Web Terminal

1. Search "Advanced SSH & Web Terminal" (not the basic "Terminal & SSH").
2. Install → Configuration tab:
   ```yaml
   username: hassio
   password: "choose a strong password"
   authorized_keys: []
   sftp: false
   compatibility_mode: false
   allow_agent_forwarding: false
   allow_remote_port_forwarding: false
   allow_tcp_forwarding: false
   ```
3. Start → check logs (should show "SSH server started").
4. Connect: `ssh hassio@192.168.1.XX -p 22222` (port 22222 by default).

### E2. Studio Code Server (in-browser editor)

1. Search "Studio Code Server".
2. Install → Configuration: set a `password`.
3. Start → open via the "Open Web UI" button (access via Ingress = no extra port).
4. This gives you VS Code in the browser for editing YAML files in `/config`.

### E3. Tailscale

1. Create a free account at `tailscale.com`.
2. Search "Tailscale" in add-on store → Install.
3. Configuration:
   ```yaml
   accept_dns: false
   accept_routes: false
   advertise_exit_node: false
   funnel: false
   log_level: warning
   login_server: https://controlplane.tailscale.com
   proxy: false
   reset: false
   stateful_filtering: false
   tags: []
   userspace_networking: false
   ```
4. Start → open add-on log → click the login URL to authorize the device.
5. In the Tailscale admin panel (`login.tailscale.com/admin`):
   - The HA device should appear. Assign it a memorable name: `home-hub-ha`.
   - Note the Tailscale IP (100.x.x.x) — this is your permanent remote HA address.
6. **Verify:** from your phone on cellular (WiFi off), open `http://100.x.x.x:8123` — HA loads.

### E4. MariaDB

1. Search "MariaDB" → Install.
2. Configuration tab:
   ```yaml
   databases:
     - homeassistant
   logins:
     - username: homeassistant
       password: "choose a strong DB password"
   rights:
     - username: homeassistant
       host: "%"
       database: homeassistant
       grant: true
   ```
3. Start → check logs.
4. Add the DB URL to your `secrets.yaml` (do this in Step F):
   ```yaml
   db_url: "mysql://homeassistant:YOUR_PASSWORD@core-mariadb/homeassistant?charset=utf8mb4"
   ```

The `packages/recorder.yaml` in this repo already references `!secret db_url`,
so once the secret is filled in, HA will use MariaDB automatically.

### E5. NUT (Network UPS Tools) — after UPS is connected

1. Connect your CyberPower/APC UPS to the mini PC via USB.
2. In Proxmox, you may need to pass the USB UPS device to the HA VM:
   - Datacenter → [Node] → [HA VM] → Hardware → Add → USB Device
   - Select "Use USB Vendor/Device ID" → find your UPS (CyberPower = 0764:0501, APC = 051D:0002)
3. Search "Network UPS Tools" add-on → Install.
4. Configuration (example for CyberPower):
   ```yaml
   devices:
     - name: myups
       driver: usbhid-ups
       port: auto
       config: []
   mode: netserver
   shutdown_host: false
   ```
5. Start → check logs → UPS name/status should appear.
6. In HA: Settings → Devices & Services → Add Integration → "Network UPS Tools"
   - Host: `a0d7b954-nut` (the add-on hostname), Port: `3493`
   - Username: `upsmon`, Password: `secret` (check add-on docs for default)

**Test graceful shutdown (Phase 7):** once everything is stable, unplug UPS power and
verify HA shuts down cleanly before the battery runs out.

---

## F. Git — connect HA's `/config` to this repo

All commands run in the HA shell (SSH or the Advanced SSH add-on's web terminal).

### F1. Initialize and connect git

```bash
cd /config

# Initialize if not already a git repo
git init

# Add this repo as remote
git remote add origin git@github.com:alaurin10/home-hub.git

# Configure git identity (required for commits)
git config user.name "Home Hub"
git config user.email "ha@home.local"
```

### F2. Create an SSH deploy key

```bash
# Generate key (no passphrase — HA needs to push unattended)
ssh-keygen -t ed25519 -C "ha-deploy-key" -f ~/.ssh/ha_deploy_key -N ""

# Show public key → copy it
cat ~/.ssh/ha_deploy_key.pub

# Tell git to use this key for github.com
cat >> ~/.ssh/config << 'EOF'
Host github.com
  IdentityFile /root/.ssh/ha_deploy_key
  StrictHostKeyChecking accept-new
EOF
chmod 600 ~/.ssh/config
```

In GitHub: **repo → Settings → Deploy keys → Add deploy key**
- Title: `HA /config deploy key`
- Key: paste the public key output
- Allow write access: ✅

### F3. Pull the repo and set up secrets

```bash
# Fetch and reset to match remote main
git fetch origin main
git reset --hard origin/main

# Confirm your /config files are now the repo files
ls packages/ esphome/ docs/
```

**Fill in secrets (do NOT commit these):**
```bash
# Copy templates
cp secrets.yaml.example secrets.yaml
cp esphome/secrets.yaml.example esphome/secrets.yaml

# Edit with nano or via Studio Code Server
nano secrets.yaml
```

Minimum values to fill in `secrets.yaml`:
```yaml
# Required for MariaDB recorder (from Step E4)
db_url: "mysql://homeassistant:YOUR_DB_PASS@core-mariadb/homeassistant?charset=utf8mb4"

# Required for notifications (your HA Companion app device name; set in Phase 6/7)
notify_target: mobile_app_your_iphone

# Placeholder values until Phase 2 (ESPHome)
esphome_api_key: ""
esphome_ota_password: ""
wifi_ssid: ""
wifi_password: ""
wifi_iot_ssid: ""
wifi_iot_password: ""
```

Verify gitignore is working:
```bash
git status
# secrets.yaml and esphome/secrets.yaml must NOT appear in the output
```

### F4. Verify and push

```bash
# Check everything looks right
git status
git diff HEAD

# Restart HA config to load the packages/ files
# (do this via HA UI: Developer Tools → Restart → Quick reload, or full restart)
```

After HA restarts, verify:
- Settings → System → Logs → no errors about recorder or db_url
- Settings → System → Database → should show "MariaDB"

**Confirm CI runs** by making a trivial push:
```bash
git checkout -b test/phase1-smoke
echo "# phase 1 smoke test" >> docs/02-bootstrap-proxmox-haos.md
git add docs/02-bootstrap-proxmox-haos.md
git commit -m "chore: phase 1 smoke test"
git push -u origin test/phase1-smoke
```
Open the repo on GitHub → Actions tab → both `validate` and `check` jobs should go green.
Open a PR → merge → delete the test branch.

---

## G. Power & UPS (if not done in E5)

1. **Connect UPS → mini PC via USB** (the cable is in the UPS box).
2. **Plug mini PC into UPS battery-backed outlets** (not surge-only).
3. **Plug router + switch into UPS** too — keeps network alive during brief outages.
4. Follow NUT add-on setup in E5 above.

---

## H. Pin HA version in CI

Once HA is running, check the version and update the pin file:

1. HA: Settings → System → About → note `Home Assistant 2026.X.Y`
2. In the repo, edit **`.ha-version`** (one line, your major.minor):
   ```
   2026.X
   ```
   (Also set `.esphome-version` to the ESPHome add-on's version once installed.)
3. Commit and push — CI will now validate against exactly your installed version.

See `docs/07-github-setup.md` §5 for the full process.

---

## I. First Proxmox snapshot + HA backup

Take these **before any further configuration** — this is your safe rollback point.

**Proxmox snapshot:**
1. Proxmox UI → select the HA VM → Snapshots tab → Take Snapshot
2. Name: `phase1-baseline`
3. Description: `HA running, MariaDB configured, git connected, Tailscale active`
4. Include RAM: ✅ (optional but useful for an exact state capture)

**HA Supervisor backup:**
1. HA → Settings → System → Backups → Create Backup
2. Type: Full
3. Name: `phase1-baseline`
4. Download the `.tar` file to your laptop/cloud storage.

> If anything goes wrong later, you can restore this snapshot in minutes.

---

## Phase 1 DoD checklist

- [ ] Proxmox web UI accessible at `https://[mini-PC-IP]:8006`; all 3 guests in the tree
- [ ] HA accessible at `http://homeassistant.local:8123` (LAN)
- [ ] HA accessible via Tailscale on cellular (WiFi off → Tailscale IP works)
- [ ] Settings → System → About → timezone and clock correct
- [ ] Settings → System → Database → shows MariaDB (not SQLite)
- [ ] **Pi-hole LXC** running; `http://<pihole-ip>/admin` loads; a client gets filtered DNS
- [ ] **Docker host VM** running; `docker run hello-world` succeeds; otherwise empty/ready
- [ ] `git push` works from HA shell; CI goes green
- [ ] `secrets.yaml` and `esphome/secrets.yaml` do NOT appear in `git status`
- [ ] Advanced SSH, Studio Code Server, Tailscale, MariaDB, NUT add-ons installed
- [ ] Proxmox snapshot taken per guest (`phase1-baseline-ha`, `-pihole`, `-docker`)
- [ ] HA backup `phase1-baseline` downloaded off-server
- [ ] (Optional) IoT VLAN configured with mDNS reflector
