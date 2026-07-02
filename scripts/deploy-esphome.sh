#!/usr/bin/env bash
# =====================================================================
# Phase 8 deploy helper — change detection + canary + batched OTA + health check.
# Runs ON the LAN runner (it can reach the IoT VLAN OTA ports). See docs/00 §4.
#
# Usage:
#   deploy-esphome.sh detect    # print changed node files (or all, if base changed)
#   deploy-esphome.sh deploy    # canary → health check → batched OTA the targets
#
# deploy needs on the runner:
#   - esphome/secrets.yaml with REAL fleet secrets (the script refuses to
#     flash with the dummy example values)
#   - HA_BASE_URL + HA_TOKEN so the health check can poll the HA API
#
# Rollback: a failed canary/batch halts the rollout (set -e), leaving
# un-flashed nodes on last-good firmware; a node that fails mid-upload keeps
# its old firmware (ESPHome OTA is atomic), and a node that boot-loops on new
# firmware falls back to WiFi+OTA via safe_mode (common/base.yaml). Operator
# rollback = git revert + push (docs/05-runbook-recovery.md §A); automated
# revert + deploy-failure notifications stay on the docs/00 §4 Phase 8
# hardening checklist.
# =====================================================================
set -euo pipefail

ESPHOME="${ESPHOME:-esphome}"
NODE_GLOB="esphome/*.yaml"
SHARED="esphome/common/"        # if anything shared changes → deploy ALL nodes
BATCH_SIZE="${BATCH_SIZE:-5}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"  # seconds to wait for a node to re-report

# List node config files (excludes secrets.yaml).
all_nodes() {
  shopt -s nullglob
  for f in $NODE_GLOB; do
    [ "$(basename "$f")" = "secrets.yaml" ] && continue
    echo "$f"
  done
}

# Which nodes changed in this push? If shared/ changed, return all nodes.
changed_nodes() {
  local base="${GITHUB_BEFORE:-HEAD~1}"
  if git diff --name-only "$base" HEAD | grep -q "^$SHARED"; then
    all_nodes
    return
  fi
  git diff --name-only "$base" HEAD \
    | grep -E '^esphome/[^/]+\.yaml$' \
    | grep -v 'secrets.yaml' || true
}

# Refuse to flash the fleet with the dummy example secrets. Real secrets are
# provisioned directly on the runner — never copied from the example.
require_real_secrets() {
  local f="esphome/secrets.yaml"
  if [ ! -f "$f" ]; then
    echo "FATAL: $f missing — provision real fleet secrets on the runner." >&2
    exit 1
  fi
  if grep -qE 'CHANGE_ME|AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' "$f"; then
    echo "FATAL: $f still contains dummy example values — refusing to deploy." >&2
    exit 1
  fi
}

# Poll the HA API until <node>'s ESPHome status sensor is back on, or timeout.
# esphome/esp-kitchen-air.yaml → binary_sensor.kitchen_air_status (the `status`
# platform from common/base.yaml — the same entity monitoring.yaml alerts on).
health_check() {
  local node entity waited state
  node="$(basename "$1" .yaml)"          # esp-kitchen-air
  entity="binary_sensor.${node#esp-}_status"
  entity="${entity//-/_}"                # binary_sensor.kitchen_air_status
  echo "Health check: $entity (timeout ${HEALTH_TIMEOUT}s)"
  waited=0
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    state="$(curl -fsS -H "Authorization: Bearer ${HA_TOKEN:?}" \
      "${HA_BASE_URL:?}/api/states/$entity" 2>/dev/null \
      | sed -n 's/.*"state"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')" || state=""
    if [ "$state" = "on" ]; then
      echo "OK: $entity is back (after ${waited}s)."
      return 0
    fi
    sleep 5
    waited=$((waited + 5))
  done
  echo "FATAL: $entity did not come back within ${HEALTH_TIMEOUT}s — halting rollout." >&2
  return 1
}

cmd="${1:-detect}"
case "$cmd" in
  detect)
    changed_nodes
    ;;
  deploy)
    require_real_secrets
    : "${HA_BASE_URL:?deploy needs HA_BASE_URL for health checks}"
    : "${HA_TOKEN:?deploy needs HA_TOKEN for health checks}"
    mapfile -t targets < <(changed_nodes)
    [ "${#targets[@]}" -eq 0 ] && { echo "No ESPHome changes — nothing to deploy."; exit 0; }
    echo "Targets: ${targets[*]}"

    # 1) Canary: first target, then health-check before continuing.
    canary="${targets[0]}"
    echo ">>> Canary OTA: $canary"
    "$ESPHOME" run "$canary" --no-logs
    health_check "$canary"

    # 2) Remaining targets in batches.
    rest=("${targets[@]:1}")
    for ((i = 0; i < ${#rest[@]}; i += BATCH_SIZE)); do
      batch=("${rest[@]:i:BATCH_SIZE}")
      echo ">>> Batch OTA: ${batch[*]}"
      for node in "${batch[@]}"; do "$ESPHOME" run "$node" --no-logs; done
      for node in "${batch[@]}"; do health_check "$node"; done
    done
    echo "Deploy complete."
    ;;
  *)
    echo "usage: $0 {detect|deploy}" >&2
    exit 2
    ;;
esac
