#!/usr/bin/env bash
# =====================================================================
# Phase 8 deploy helper — change detection + canary + batched OTA + health check.
# SKELETON: fill in the TODOs when you stand up the self-hosted runner.
# Runs ON the LAN runner (it can reach the IoT VLAN OTA ports). See docs/00 §4.
#
# Usage:
#   deploy-esphome.sh detect    # print changed node files (or all, if base changed)
#   deploy-esphome.sh deploy    # canary → health check → batched OTA the targets
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

# TODO: poll the HA API until <node>'s connection sensor is back, or timeout.
health_check() {
  local node="$1"
  echo "TODO: health-check $node via HA API (\$HA_BASE_URL/\$HA_TOKEN), timeout=${HEALTH_TIMEOUT}s"
  # curl -fsS -H "Authorization: Bearer $HA_TOKEN" \
  #   "$HA_BASE_URL/api/states/binary_sensor/<node>_status" ...
}

cmd="${1:-detect}"
case "$cmd" in
  detect)
    changed_nodes
    ;;
  deploy)
    mapfile -t targets < <(changed_nodes)
    [ "${#targets[@]}" -eq 0 ] && { echo "No ESPHome changes — nothing to deploy."; exit 0; }
    echo "Targets: ${targets[*]}"

    # 1) Canary: first target, then health-check before continuing.
    canary="${targets[0]}"
    echo ">>> Canary OTA: $canary"
    cp esphome/secrets.yaml.example esphome/secrets.yaml 2>/dev/null || true  # TODO: real secrets on runner
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
