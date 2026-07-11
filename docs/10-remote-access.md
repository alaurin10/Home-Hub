# 10 — Remote access: dashboards in any browser (Cloudflare Tunnel + Access)

> Decision (July 2026): browser dashboards are reached via **Cloudflare Tunnel +
> Access** — open `https://grafana.<domain>` / `https://ha.<domain>` on any
> device, pass the Access login, then the app's own login. No VPN client on the
> viewing device, no inbound router ports (docs/00 §3), data stays home and only
> the *view* is proxied. Rationale + alternatives considered: docs/00 §10.
> Tailscale is **not** removed — it stays for admin/SSH and the HA Companion app
> (the app doesn't render the Access login page).

**Scope now:** `grafana.<domain>` (Grafana add-on) + `ha.<domain>` (HA UI).
**Later:** `dash.<domain>` (custom dashboard app) — see the last section.

Everything below happens on the live system (Cloudflare dashboard + HA add-on
config); the only repo-tracked piece is the `http:` block already stubbed in
`configuration.yaml`.

---

## 0. Prerequisites

- The existing domain is active in Cloudflare (nameservers at Cloudflare) — it is.
- Enable **Zero Trust** on the Cloudflare account (one.dash.cloudflare.com,
  free plan, ≤50 users) and pick a team name. No payment method is needed for
  the free plan features used here.
- Grafana + InfluxDB add-ons installed and working on the LAN (Phase 4).

## 1. Harden the Grafana add-on (before exposing anything)

The community Grafana add-on ships with the default `admin` / `hassio` login —
change it *first*, then configure via the add-on's **Configuration** tab:

- **Options → `env_vars`** (only `GF_`-prefixed vars are accepted):

  ```yaml
  env_vars:
    - name: GF_SERVER_ROOT_URL
      value: "https://grafana.<domain>"
    - name: GF_AUTH_ANONYMOUS_ENABLED
      value: "false"
    - name: GF_USERS_ALLOW_SIGN_UP
      value: "false"
  ```

- **Network:** expose host port **3000** (used by the tunnel target below and,
  later, by the Caddy LAN proxy in docs/09 N2; it is never reachable from the
  internet — the router forwards nothing).
- In Grafana itself: change the `admin` password; add a second **Viewer**-role
  account (e.g. `phone`) for day-to-day use on mobile — the admin login never
  leaves the LAN.

Add-on option mirror lives in `grafana/README.md`.

## 2. Cloudflared add-on → tunnel + DNS

Install the community **Cloudflared** add-on
(<https://github.com/brenner-tobias/addon-cloudflared>) in the HAOS VM and
configure:

```yaml
external_hostname: "ha.<domain>"
additional_hosts:
  - hostname: "grafana.<domain>"
    service: "http://a0d7b954-grafana:3000"
```

- `a0d7b954-grafana` is the Grafana add-on's hostname on the Supervisor's
  internal docker network (same pattern as the InfluxDB datasource URL in
  `grafana/provisioning/datasources/influxdb.yaml.example`). If it doesn't
  resolve, fall back to `service: "http://<HAOS-LAN-IP>:3000"` — that's what
  the exposed port from step 1 is for.
- Start the add-on and open its **log**: it prints a Cloudflare login URL.
  Authenticate once → the add-on creates the tunnel (**outbound-only**, no
  port-forwards) and the `ha.` / `grafana.` DNS records automatically.
- (Alternative: create a remote-managed tunnel in the Zero Trust dashboard and
  set `tunnel_token` instead — not needed for this setup.)

## 3. Home Assistant behind the proxy

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

## 4. Cloudflare Access — the identity gate

In **Zero Trust → Access → Applications**, add one self-hosted application per
hostname (`ha.<domain>`, `grafana.<domain>`):

- **Policy:** Allow → include *Emails* = your email only.
- **Identity:** Google SSO (add Google under Settings → Authentication;
  one-time-PIN email works as a zero-setup fallback).
- **Session duration:** ~30 days (per-device re-auth monthly).

Nothing reaches HA or Grafana without passing Access first; each app's own
login (step 1's accounts, HA's users + optional 2FA) is the second layer.
Without an Access app, a tunnel hostname is public — **never** skip this step
for a new hostname.

## 5. Verification (DoD)

On a phone **on cellular** (WiFi off):

- [ ] `https://grafana.<domain>` → Access login → Grafana login (viewer
      account) → live sensor charts.
- [ ] `https://ha.<domain>` → Access login → HA login → Lovelace loads;
      no `400 Bad Request` (if you get one, the `trusted_proxies` subnet is
      wrong — see step 3).
- [ ] Router: **zero** port-forward rules exist.
- [ ] Incognito browser, no Access session: both URLs stop at the Access page.
- [ ] Grafana `/login` with anonymous access confirmed off (no dashboards
      render pre-login).
- [ ] HA Companion app still connects via Tailscale (unchanged).

## Later: the custom dashboard app

When `apps/dashboard/` deploys on the Docker host VM (compose, port 8080),
publishing it is two small additions — no new infrastructure:

1. Cloudflared add-on config:

   ```yaml
   additional_hosts:
     - hostname: "grafana.<domain>"
       service: "http://a0d7b954-grafana:3000"
     - hostname: "dash.<domain>"
       service: "http://<docker-vm-ip>:8080"
   ```

2. A matching Access application for `dash.<domain>` (same policy). This is
   mandatory here: the app has **no auth of its own** (HA token lives
   server-side, docs/00 §10) — Access is its *only* login.
