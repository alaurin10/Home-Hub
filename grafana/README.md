# Grafana add-on — authored config mirror

Grafana runs as the community **Grafana add-on** inside the HA OS VM. Like the
other add-on directories in this repo, only the **authored** parts live in git:
provisioning files (`provisioning/`) and the add-on options recorded here.
Dashboards built in the UI, users, and sessions are runtime state → Supervisor
backup, never git. See docs/00 §8 and docs/10-remote-access.md.

## Add-on options (Configuration tab)

| Option | Value | Why |
|---|---|---|
| `env_vars` → `GF_SERVER_ROOT_URL` | `https://grafana.<domain>` | Correct links/redirects behind the Cloudflare Tunnel |
| `env_vars` → `GF_AUTH_ANONYMOUS_ENABLED` | `"false"` | Never expose dashboards pre-login |
| `env_vars` → `GF_USERS_ALLOW_SIGN_UP` | `"false"` | Accounts are created by admin only |
| Network → host port | `3000` | Tunnel fallback target + future Caddy LAN proxy (docs/09 N2); never internet-reachable |

```yaml
env_vars:
  - name: GF_SERVER_ROOT_URL
    value: "https://grafana.<domain>"
  - name: GF_AUTH_ANONYMOUS_ENABLED
    value: "false"
  - name: GF_USERS_ALLOW_SIGN_UP
    value: "false"
```

Only `GF_`-prefixed environment variables are accepted by the add-on.

## Accounts (runtime, listed for the runbook)

- `admin` — **change the shipped default password (`hassio`) before the tunnel
  goes live**; LAN/admin use only.
- `phone` (Viewer role) — day-to-day mobile login behind Cloudflare Access.

## Provisioning

- `provisioning/datasources/influxdb.yaml.example` — InfluxDB 2.x (Flux)
  datasource; read-only token injected via env, not git (`influxdb/README.md`).
- `provisioning/dashboards/` — committed dashboard JSON lands here starting
  with docs/09 M3 (`allowUiUpdates: false` once dashboards are code).
