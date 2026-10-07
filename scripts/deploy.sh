#!/usr/bin/env bash
# Deploy committed sources only. Usage: deploy.sh HOST DIRECTORY COMMIT [--check]
set -euo pipefail
host="${1:-}"
directory="${2:-}"
revision="${3:-}"
mode="${4:-}"
if [[ ! "$host" =~ ^[a-zA-Z0-9][a-zA-Z0-9.@_-]*$ || ! "$directory" =~ ^/[a-zA-Z0-9/_-]+$ || ! "$revision" =~ ^[0-9a-f]{40}$ || ( -n "$mode" && "$mode" != --check ) ]]; then
  echo 'Usage: bash scripts/deploy.sh HOST /absolute/directory FULL_COMMIT [--check]' >&2
  exit 2
fi
cd "$(dirname "$0")/.."
git cat-file -e "$revision^{commit}"
git cat-file -e "$revision:scripts/deploy-remote.sh"
# Values are deliberately expanded locally after the strict character allowlist above.
# shellcheck disable=SC2029
ssh "$host" "set -eu; cd '$directory'; command -v python3 >/dev/null; docker compose config --quiet </dev/null; test -d data; test -d backups; docker compose ps </dev/null"
if [[ "$mode" == --check ]]; then
  echo "Preflight passed for $revision; no files or services changed."
  exit 0
fi
# Validated directory and commit must expand on the client.
# shellcheck disable=SC2029
git archive --format=tar "$revision" | ssh "$host" "set -eu; cd '$directory'; mkdir -p 'releases/$revision'; tar -xf - -C 'releases/$revision'"
# Execute a committed script, not a shell assembled from working-tree content.
# Validated directory and commit must expand on the client.
# shellcheck disable=SC2029
ssh "$host" "bash '$directory/releases/$revision/scripts/deploy-remote.sh' '$directory' '$revision'" </dev/null
