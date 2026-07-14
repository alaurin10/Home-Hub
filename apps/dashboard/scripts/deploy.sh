#!/usr/bin/env bash
# =====================================================================
# Poll-and-deploy for apps/dashboard/. Run on a timer (see ../systemd/) on
# the Docker host: fast-forwards main, and only rebuilds the compose stack
# if apps/dashboard/** actually changed. Outbound-only (polls GitHub) --
# no inbound ports, no webhook receiver, matching the no-inbound-ports
# posture (docs/00-architecture.md SS10 / docs/10-remote-access.md).
#
# Requires: the repo checked out on DEPLOY_BRANCH with a clean working
# tree (no local edits -- this is a deploy target, not a dev checkout).
# =====================================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
BRANCH="${DEPLOY_BRANCH:-main}"
WATCH_PATH="apps/dashboard"

cd "$REPO_DIR"

git fetch --quiet origin "$BRANCH"

local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse "origin/$BRANCH")

if [ "$local_sha" = "$remote_sha" ]; then
  exit 0   # nothing new
fi

if git diff --quiet "$local_sha" "$remote_sha" -- "$WATCH_PATH"; then
  echo "$(date -u +%FT%TZ) origin/$BRANCH moved but $WATCH_PATH is unchanged; fast-forwarding without redeploy."
  git merge --ff-only "origin/$BRANCH"
  exit 0
fi

echo "$(date -u +%FT%TZ) $WATCH_PATH changed on $BRANCH ($local_sha -> $remote_sha) -- deploying"
git merge --ff-only "origin/$BRANCH"

cd "$WATCH_PATH"
docker compose up -d --build

echo "$(date -u +%FT%TZ) deploy complete: $remote_sha"
