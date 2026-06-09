# 07 — GitHub Repository Setup

> One-time configuration for the private `alaurin10/home-hub` repo.
> Do this during Phase 0/1 before the first real PR.

## 1. Branch protection for `main`

Enforce the validation gate so no bad config can reach `main` (and the LAN runner)
without passing CI first.

**GitHub → Settings → Branches → Add branch protection rule**

| Setting | Value |
|---|---|
| Branch name pattern | `main` |
| Require a pull request before merging | ✅ (recommended; 1 approval = yourself is fine) |
| Require status checks to pass before merging | ✅ |
| Require branches to be up to date before merging | ✅ |
| Status checks — add both: | `validate` (esphome-validate.yml) and `check` (ha-check.yml) |
| Do not allow bypassing the above settings | ✅ (so even you can't force-push past CI) |
| Allow force pushes | ❌ |
| Allow deletions | ❌ |

The two required status check names come from the `jobs:` keys in the workflow files:
- `validate` → `.github/workflows/esphome-validate.yml`
- `check` → `.github/workflows/ha-check.yml`

> **Note:** Status checks only appear in the dropdown after they have run at least once.
> Push a trivial change on a branch, open a PR, and let CI run — then come back here
> and add the checks.

## 2. Repository secrets (for Phase 8 deploy)

**GitHub → Settings → Secrets and variables → Actions**

These are filled in during Phase 8 when you set up the self-hosted runner.
Document the names here so nothing is forgotten:

| Secret name | Contents |
|---|---|
| `HA_TOKEN` | Long-lived HA token (Settings → Profile → Long-Lived Access Tokens) |
| `HA_URL` | Internal HA URL, e.g. `http://192.168.1.50:8123` |
| `ESP_WIFI_PASSWORD` | WiFi password for the IoT VLAN |
| `ESP_OTA_PASSWORD` | Per-node OTA password (set in `esphome/secrets.yaml`) |
| `ESP_API_KEY` | ESPHome encryption key |

## 3. Repository variable (deploy gate)

**GitHub → Settings → Secrets and variables → Actions → Variables tab**

| Variable name | Value | When to set |
|---|---|---|
| `DEPLOY_ENABLED` | `false` | Phase 0 (set now — keeps deploy.yml inert) |
| `DEPLOY_ENABLED` | `true` | Phase 8 (flip once runner is registered + tested) |

## 4. Self-hosted runner (Phase 8 only)

**GitHub → Settings → Actions → Runners → New self-hosted runner**

- OS: Linux (x64)
- Label: `home-lan` (this is what `deploy.yml` targets via `runs-on: [self-hosted, home-lan]`)
- Host: the isolated Proxmox LXC on your LAN

Follow the on-screen registration commands inside the LXC. Then enable the runner
service: `sudo ./svc.sh install && sudo ./svc.sh start`.

Firewall the runner LXC to allow only:
- Outbound: GitHub (443), HA VM (SSH 22, API 8123), IoT VLAN OTA ports (6053, 3232)
- Inbound: nothing

## 5. Keeping CI pinned to your HA version

The pins live in two one-line files at the repo root (the workflows read them):

- `.ha-version` — the HA image tag for `ha-check.yml` (format `202X.Y`, no
  leading zero on the month)
- `.esphome-version` — the exact ESPHome release for `esphome-validate.yml`
  (match the ESPHome add-on version)

When you upgrade HA or the ESPHome add-on, edit the matching file and push —
no workflow edits needed. Check your HA version: **Settings → System → About**
→ `Home Assistant 202X.Y.Z` → use `202X.Y`.

The weekly `upgrade-canary.yml` workflow validates against the **latest** HA
image and ESPHome release regardless of the pins — if it goes red, fix the
config *before* you upgrade.
