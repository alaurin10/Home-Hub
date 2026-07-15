# 10 — Remote access: dashboards in any browser (Cloudflare Tunnel + Access)

> Decision (July 2026): browser dashboards are reached via **Cloudflare Tunnel +
> Access** — open `https://dash.<domain>` / `https://ha.<domain>` on any
> device, pass the Access login, then the app's own login (HA only — the
> dashboard app has none of its own by design). No VPN client on the
> viewing device, no inbound router ports (docs/00 §3), data stays home and only
> the *view* is proxied. Rationale + alternatives considered: docs/00 §10.
> Tailscale is **not** removed — it stays for admin/SSH and the HA Companion app
> (the app doesn't render the Access login page).

**Scope:** `ha.<domain>` (HA UI) + `dash.<domain>` (the custom dashboard app,
`apps/dashboard/`). InfluxDB + Grafana were removed (July 2026) before this
setup was completed, so this doc never had a `grafana.<domain>` hostname to
retire — the dashboard app was always the intended long-term "deep charts"
surface here.

Everything below happens on the live system (Cloudflare dashboard + HA add-on
config); the only repo-tracked piece is the `http:` block already stubbed in
`configuration.yaml`.

---

## 0. Prerequisites

- The existing domain is active in Cloudflare (nameservers at Cloudflare) — it is.
- Enable **Zero Trust** on the Cloudflare account (one.dash.cloudflare.com,
  free plan, ≤50 users) and pick a team name. No payment method is needed for
  the free plan features used here.
- `apps/dashboard/` deployed and reachable on the LAN (`docker compose up -d
  --build` on the Docker host VM, port 8080) — see `apps/dashboard/README.md`.

> **Naming note (HA 2026.2+):** "Add-ons" were renamed to "Apps" across the HA
> UI — Settings → Add-ons is now **Settings → Apps**, "Add-on Store" is now the
> **App Store**. Same mechanism, new labels. This doc uses the current terms.

## 1. Cloudflared add-on → tunnel + DNS

Install the **Cloudflared** app — add the repository
`https://github.com/homeassistant-apps/repository` first if you haven't, then
configure:

```yaml
external_hostname: "ha.<domain>"
additional_hosts:
  - hostname: "dash.<domain>"
    service: "http://<docker-vm-ip>:8080"
```

- `<docker-vm-ip>` is the Docker host VM's LAN IP (or a `.home.arpa` name once
  `docs/09-roadmap.md` N1/N2 land) — wherever `apps/dashboard/` is actually
  reachable on port 8080.
- Start the add-on and open its **log**: it prints a Cloudflare login URL.
  Authenticate once → the add-on creates the tunnel (**outbound-only**, no
  port-forwards) and the `ha.` / `dash.` DNS records automatically.
- (Alternative: create a remote-managed tunnel in the Zero Trust dashboard and
  set `tunnel_token` instead — not needed for this setup.)

## 2. Home Assistant behind the proxy

`configuration.yaml` already carries the stub:

```yaml
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 172.30.33.0/24      # Supervisor add-on network
```

Confirm the subnet matches the cloudflared add-on's actual docker subnet
(add-on documentation/log shows it; `172.30.33.0/24` is the usual value).
Then set **Settings → System → Network → Home Assistant URL → Internet** to
`https://ha.<domain>`.

## 3. Cloudflare Access — the identity gate

In **Zero Trust → Access → Applications**, add one self-hosted application per
hostname (`ha.<domain>`, `dash.<domain>`):

- **Policy:** Allow → include *Emails* = your email only.
- **Identity:** Google SSO (add Google under Settings → Authentication;
  one-time-PIN email works as a zero-setup fallback).
- **Session duration:** ~30 days (per-device re-auth monthly).

Nothing reaches HA or the dashboard app without passing Access first. For HA,
its own login (users + optional 2FA) is a second layer on top. For the
dashboard app, **Access is the only login** — it has no auth of its own by
design (the HA token lives server-side only, docs/00 §10) — so this step is
mandatory, not optional, for `dash.<domain>`. Without an Access app, a tunnel
hostname is public — **never** skip this step for a new hostname.

## 4. Verification (DoD)

On a phone **on cellular** (WiFi off):

- [ ] `https://dash.<domain>` → Access login → live sensor cards, values
      updating.
- [ ] `https://ha.<domain>` → Access login → HA login → Lovelace loads;
      no `400 Bad Request` (if you get one, the `trusted_proxies` subnet is
      wrong — see step 2).
- [ ] Router: **zero** port-forward rules exist.
- [ ] Incognito browser, no Access session: both URLs stop at the Access page.
- [ ] HA Companion app still connects via Tailscale (unchanged).
