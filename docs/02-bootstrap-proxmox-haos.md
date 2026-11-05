# 02 — Phase 1: Detailed Setup Guide
## Proxmox + Home Assistant OS + Docker host + Network + Add-ons + Git

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
MariaDB + a few LXCs with headroom. The dual 2.5 GbE port makes IoT
VLAN isolation easy without a USB NIC.

**Minimum spec:**
- CPU: Intel N100 / N150 / N305 (4–8 core, low TDP — avoid N95: only 2-core)
- RAM: **16 GB** (32 GB if <$20 delta)
- Storage: **500 GB NVMe SSD** (never eMMC — too slow for MariaDB writes)
- Ports: USB-A × 3+, HDMI/DP, ethernet × 1–2

| Model | CPU | Price | Notes |
|---|---|---|---|
| **Beelink EQ12 Pro** ← recommended | N305 | **~$179** Amazon | Dual 2.5 GbE; best all-round |
| GMKtec NucBox G3 | N300 | ~$169 Amazon | Comparable; less community testing |
| Trigkey Key N150 | N150 | ~$139–149 Amazon | Budget pick; fine for HA-only |
| MINISFORUM UM350 | Ryzen 5 3550H | ~$220–250 Amazon | Overkill unless adding Frigate NVR |

> AliExpress is NOT cheaper here — these brands already ship from China via Amazon FBA
> at the same price as their AliExpress stores, and Amazon gives you returns + faster shipping.

#### UPS — protects MariaDB from unclean power loss

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

## C. Create the guests (HA VM + Docker host VM)

> Two guests run on Proxmox. **Home Assistant** is a full VM (it's an appliance); the
> **Docker host** is a small VM that runs your containerized apps (the Home-Hub dashboard,
> plus garmin-mcp + the Garmin dashboard). Sized to fit the **128 GB SSD** with room for
> snapshots/backups:
>
> *(A Pi-hole LXC was originally the second guest; it was decommissioned in Nov 2026.)*

| Guest | Type | vCPU | RAM | Disk | Created in |
|---|---|---|---|---|---|
| Home Assistant OS | VM | 2 | 4 GB | 48 GB | C1–C3 |
| Docker host (Debian) | VM | 2 | 4 GB | 24 GB | C4 |

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

**Set resources to fit the 2-guest budget** (Hardware tab):
- Processors: 2 (plenty for HA; leaves cores for the other guests — easy to raise later)
- Memory: 4096 MB (HA is comfortable in 4 GB; the rest is reserved for the Docker VM)
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

### C4. Docker host VM (the second guest)

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

### D0. Router type — Which path to follow?

**If you have an Xfinity gateway (xFi Gateway / XB6/XB7/XB8):**
→ **Skip to D-Xfinity below.** These gateways do NOT support VLANs, custom firewall rules, or tagged networks. Standard VLAN setup doesn't apply.

**If you have UniFi, OPNsense, pfSense, OpenWRT, or another router with VLAN support:**
→ **Follow D1–D2 below** for the full isolated IoT network.

### D-Xfinity: For Xfinity Gateway Users (No VLAN Support)

The default Xfinity gateway (xFi Gateway) cannot do VLANs, custom firewall rules, or any of the D1–D2 setup.

**Option 1: Keep everything on the flat network (Recommended for Xfinity users)**

1. Your Proxmox host, HA VM, and ESP32 devices all share the same DHCP range (usually `10.0.0.x`, `192.168.0.x`, or `192.168.1.x`).
2. No firewall rules needed — skip all of D1's rules.
3. No Avahi reflector — mDNS discovery (ESPHome/HA zeroconf) works natively on a flat network.
4. **Verify your network range:** Xfinity app → WiFi → your network → Connected Devices (shows you the DHCP range).

**Trade-off:** No network isolation between IoT devices and other devices. For a homelab with DIY sensors, this is acceptable. If network isolation is critical, you'll need to replace your Xfinity gateway (see Option 2).

**Option 2: Replace Xfinity gateway with a real router**

Put Xfinity in **bridge mode** (Xfinity app → WiFi → [gateway] → Bridge Mode) to disable its router entirely, then install:
- A UniFi Dream Machine/Router, or
- An OPNsense/pfSense box, or
- An OpenWRT router

Then follow D1–D2 below. **Not recommended for most** — bridge mode removes Xfinity's WiFi and router entirely, requiring full reconfiguration.

### D1. What you need (for VLAN-capable routers)

- **IoT VLAN** (e.g., VLAN ID 20, subnet `192.168.20.0/24`)
- **DHCP on IoT VLAN** (router serves addresses in the 192.168.20.x range)
- **mDNS reflector** across VLANs (Avahi, or a second NIC for HA)
- **Firewall rules:**
  - IoT → HA: allow TCP 6053 (ESPHome API), UDP 5353 (mDNS), TCP 1883 (MQTT in Phase 5)
  - HA → IoT: allow TCP 6053 (OTA), TCP 3232 (OTA alt), TCP 80 (ESPHome fallback)
  - IoT → Main LAN: **BLOCK** (ESP32 firmware isn't hardened)
  - Main LAN / Tailscale → HA: allow (for your devices)

**Why mDNS reflection matters:**
mDNS (used by ESPHome discovery) relies on multicast UDP 5353 on the local subnet. Routers don't forward multicast between VLANs by default, even if you open the port in the firewall. You need something actively relaying the multicast packets — that's Avahi in reflector mode (or your router's built-in mDNS feature, like UniFi's). Without it, auto-discovery silently fails.

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

Install these via **Settings → Apps → App Store** (search each by name).

> **Naming note (HA 2026.2+):** Home Assistant renamed "Add-ons" to "Apps"
> across the UI — Settings → Add-ons is now **Settings → Apps**, the
> "Add-on Store" is now the **App Store**, and the Supervisor panel is folded
> into the main frontend (same underlying mechanism, just relabeled and
> faster). Third-party add-on/app documentation you find online — including
> most of the pages linked from this doc — still says "add-on"; that's the
> same thing. If your HA predates 2026.2, use "Add-ons"/"Add-on Store" instead.

### General add-on installation flow

Each add-on has a **Configuration** tab where you paste YAML directly (not individual toggles).

1. **Settings** → **Apps** → **App Store** → search by exact name
2. **Install** button (wait for it to complete)
3. **Configuration** tab → toggle to raw YAML mode if needed → **paste the config block** → **Save**
4. **Info** tab → toggle **Start** on → optionally enable "Start on boot" and "Watchdog"
5. **Log** tab → confirm no errors (look for "started" or "running")

**Where to put your own values:**
- Replace `"choose a strong password"` with an actual password you set
- Replace `192.168.1.XX` with your actual HA IP (check Settings → System → Network in HA, or your router's device list)
- Replace `YOUR_PASSWORD` with actual database passwords you created

### Adding a third-party repository (needed for E8 below)

Some apps (Cloudflared) don't ship in HA's default catalog and need their
repository added once, first:

1. **Settings** → **Apps** → **App Store**
2. **⋮** (three-dot menu, top-right of the store page) → **Repositories**
3. Paste the repository URL → **Add** → close the dialog
4. The app(s) from that repository now show up in the store's search/list —
   proceed with the normal install flow above.

(This is unchanged from the pre-2026.2 "Add-on Store" flow — only the
surrounding labels moved.)

### E1. Advanced SSH & Web Terminal

Gives you SSH access to the HA OS for advanced troubleshooting and CLI commands.

**Installation:**
1. Search **"Advanced SSH & Web Terminal"** (NOT the plain "Terminal & SSH")
2. Install → Configuration tab

**Configuration YAML:**
```yaml
username: hassio
password: "pick-a-strong-password-here"
authorized_keys: []
sftp: false
compatibility_mode: false
allow_agent_forwarding: false
allow_remote_port_forwarding: false
allow_tcp_forwarding: false
```

3. Save → **Info** tab → **Start** → check **Log** tab for errors

**Connect from your laptop:**
```bash
ssh hassio@10.0.0.188 -p 22
```

**Important:** This add-on defaults to **port 22** (not 22222). If you see "Connection refused":
- Check the add-on's **Log** tab to confirm "SSH server started"
- Ensure the add-on status shows "STARTED" (green dot)
- Try stopping and restarting the add-on if the port binding failed
- Use `-p 22` — the config defaults to port 22, not 22222

**On first connection:** you'll see a host key fingerprint warning → type `yes` to accept.

### E2. Studio Code Server (in-browser editor)

VS Code running in your browser for editing HA's YAML files.

**Installation:**
1. Search **"Studio Code Server"**
2. Install → **Configuration** → set `password: "your-password"`
3. Save → **Info** → **Start**
4. Once running, click **"Open Web UI"** button (or Settings → Add-ons → Studio Code Server → "Open Web UI")

You now have VS Code in your browser, already pointed at `/config`.

### E3. Tailscale

Remote access to HA from outside your home network (e.g., cellular) at a stable Tailscale IP (`100.x.x.x`).

**Prerequisites:**
- Free Tailscale account at https://tailscale.com

**Installation:**
1. Search **"Tailscale"**
2. Install → **Configuration** tab

**Configuration YAML:**
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

3. Save → **Info** → **Start**
4. Go to the **Log** tab — you'll see a **login URL** printed there. **Click that URL** to authorize the device in Tailscale.

**After authorization:**
1. Open https://login.tailscale.com/admin (your Tailscale dashboard)
2. Find the HA device in the list
3. Edit its name to something memorable: `home-hub-ha`
4. **Note the Tailscale IP** (format: `100.x.x.x`) — this is your permanent remote HA address

**Verify remote access:**
- Turn WiFi off on your phone (use cellular)
- Open browser to `http://100.x.x.x:8123` (your Tailscale IP)
- HA should load

### E4. MariaDB

Persistent database for HA recordings (history, statistics). Without this, HA only keeps a few days of data in memory.

**Installation:**
1. Search **"MariaDB"**
2. Install → **Configuration** tab

**Configuration YAML:**
```yaml
databases:
  - homeassistant
logins:
  - username: homeassistant
    password: "pick-a-strong-db-password"
rights:
  - username: homeassistant
    host: "%"
    database: homeassistant
    grant: true
```

3. Save → **Info** → **Start** → check **Log** tab for errors

**Add the database connection to secrets (critical step):**

1. SSH into HA or use Studio Code Server (E2)
2. Edit `/config/secrets.yaml` (create it if it doesn't exist)
3. Add this line:
```yaml
recorder_db_url: "mysql://homeassistant:YOUR_PASSWORD@core-mariadb/homeassistant?charset=utf8mb4"
```

Replace `YOUR_PASSWORD` with the MariaDB password you set above.

**IMPORTANT:** The secret **must** be named `recorder_db_url` (not `db_url`). The `packages/recorder.yaml` in this repo references this exact name. If you get "Secret recorder_db_url not defined" error on restart, check that the secret name matches exactly.

4. Restart HA (Settings → System → Restart → Quick reload)
5. Verify: Settings → System → Database should show "MariaDB" (not SQLite)

### E5. NUT (Network UPS Tools) — after UPS is connected

Only relevant if you have a UPS connected via USB. Skip this unless you physically plug in a UPS to the Proxmox host.

**Installation:**
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

### E6/E7 — removed (July 2026)

~~InfluxDB 2.x~~ and ~~Grafana~~ were installed here originally, then removed:
the custom dashboard app (`apps/dashboard/`) reads HA's own recorder/long-term
statistics directly, so there's no second database or charting add-on to
install. See `docs/00-architecture.md` §8/§10 and `apps/dashboard/README.md`.

### E8. Cloudflared (for `docs/10-remote-access.md`)

Needed once you're ready to reach HA (and the custom dashboard app) from
outside the LAN.

**Installation:**
1. Add the repository first: `https://github.com/homeassistant-apps/repository`
   (this replaces the older `brenner-tobias/addon-cloudflared` link you may see
   in older guides — same app, new home).
2. Search **"Cloudflared"** → **Install**.
3. Continue with the full tunnel + Access setup in `docs/10-remote-access.md`
   (this section only covers getting the app installed).

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

## Editing Files in the HA Terminal

If you SSH into HA and need to edit a file, you have three options:

### Option 1: Use `nano` (easiest)
```bash
nano ~/.ssh/config
# or
nano /config/secrets.yaml
```
- Edit your text
- Press `Ctrl+X` → `Y` → `Enter` to save

### Option 2: Use `cat` with heredoc (no editor needed)
```bash
cat > ~/.ssh/config << 'EOF'
Host github.com
  IdentityFile /root/.ssh/ha_deploy_key
  StrictHostKeyChecking accept-new
EOF
```
- Paste your multi-line text between the delimiters
- Type `EOF` on its own line to finish

### Option 3: Avoid the terminal, use Studio Code Server (E2)
- Already running in your browser
- Much more user-friendly for editing files

---

## Troubleshooting

### SSH Connection Refused (E1)
- Check the add-on's **Log** tab for errors
- Confirm the add-on status shows **"STARTED"** (green dot)
- Try **Stop** → **Start** again to restart the SSH service
- Try port **22** if the configured port doesn't work (this is the default)

### Secret Not Defined Error (E4)
- Error message: `Error loading /config/configuration.yaml: Secret recorder_db_url not defined`
- Check that `/config/secrets.yaml` has the line `recorder_db_url: ...`
- The secret **must** be named `recorder_db_url`, not `db_url`
- After adding the secret, **restart HA** (Settings → System → Restart → Quick reload)

### MariaDB Fails to Start (E4)
- Check MariaDB add-on's **Log** tab for errors
- Ensure you set a **password** in the Configuration (not an empty password)
- Try **Stop**, wait 30 seconds, then **Start** again
- Verify the password you used in the config matches what you put in `secrets.yaml`

### Tailscale Stuck on Login (E3)
- Check the **Log** tab — sometimes the login URL is printed multiple times
- Click a fresh login URL from the logs
- If already authorized, try **Stop** → **Start** to restart the add-on

### HA Version Missing or Wrong in `settings.yaml`
- Settings → System → About → note the version (e.g., `Home Assistant 2026.7.1`)
- Extract major.minor (e.g., `2026.7`) and create/update `.ha-version` with just that line
- Commit and push — CI will now validate against your exact version

---

## Phase 1 DoD checklist

- [ ] Proxmox web UI accessible at `https://[mini-PC-IP]:8006`; both guests in the tree
- [ ] HA accessible at `http://homeassistant.local:8123` (LAN)
- [ ] HA accessible via Tailscale on cellular (WiFi off → Tailscale IP works)
- [ ] Settings → System → About → timezone and clock correct
- [ ] Settings → System → Database → shows MariaDB (not SQLite)
- [ ] **Docker host VM** running; `docker run hello-world` succeeds; otherwise empty/ready
- [ ] `git push` works from HA shell; CI goes green
- [ ] `secrets.yaml` and `esphome/secrets.yaml` do NOT appear in `git status`
- [ ] Advanced SSH, Studio Code Server, Tailscale, MariaDB, NUT add-ons installed
- [ ] Proxmox snapshot taken per guest (`phase1-baseline-ha`, `-docker`)
- [ ] HA backup `phase1-baseline` downloaded off-server
- [ ] (Optional) IoT VLAN configured with mDNS reflector
