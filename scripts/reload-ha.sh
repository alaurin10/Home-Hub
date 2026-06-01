#!/usr/bin/env bash
# =====================================================================
# Phase 8 deploy helper — sync this repo into HA's /config and reload via API.
# SKELETON: fill in the TODOs when you stand up the self-hosted runner. §4.
#
# Reloads are targeted where possible (no full restart for small changes).
# Requires HA_BASE_URL and HA_TOKEN (a long-lived access token) in the env.
# =====================================================================
set -euo pipefail

: "${HA_BASE_URL:?set HA_BASE_URL}"
: "${HA_TOKEN:?set HA_TOKEN}"

api() {
  curl -fsS -X POST \
    -H "Authorization: Bearer $HA_TOKEN" \
    -H "Content-Type: application/json" \
    "$HA_BASE_URL/api/services/$1" -d '{}'
}

# 1) Sync authored config into HA's /config (runner has SSH/rsync to the HA VM).
echo "TODO: rsync repo → HA /config (exclude gitignored/runtime paths)"
# rsync -a --delete --exclude-from=.gitignore ./ ha:/config/

# 2) Validate before reloading (fail fast).
echo "TODO: ssh ha 'ha core check'   # validate on the box before reload"

# 3) Targeted reloads (extend as your config grows).
echo "Reloading HA config..."
api homeassistant/reload_core_config
api automation/reload
api script/reload
api scene/reload
# Full restart only when needed (integrations added/changed):
# api homeassistant/restart

# 4) Mirrored add-on configs (Z2M / Grafana) → copy into place + restart add-on.
echo "TODO: copy zigbee2mqtt/ + grafana/ mirrors into /addon_configs and restart those add-ons"

echo "HA reload complete."
