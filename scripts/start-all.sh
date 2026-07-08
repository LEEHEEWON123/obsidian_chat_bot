#!/usr/bin/env bash
# gateway(:8642) + dashboard(:9119) + Hermes Workspace(:3000)를 한 번에 실행.
# Ctrl+C 하면 셋 다 종료됩니다.
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"
WORKSPACE_DIR="$HOME/hermes-workspace"

pids=()
cleanup() {
  echo ""
  echo "[start-all] stopping..."
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait_for() {
  local url="$1" name="$2" tries=0
  until curl -sf -o /dev/null "$url" 2>/dev/null; do
    tries=$((tries + 1))
    if [ "$tries" -gt 60 ]; then
      echo "[start-all] $name did not come up at $url"
      return 1
    fi
    sleep 1
  done
  echo "[start-all] $name ready ($url)"
}

echo "[start-all] gateway :8642"
hermes gateway run --accept-hooks &
pids+=($!)

echo "[start-all] dashboard :9119"
hermes dashboard &
pids+=($!)

wait_for "http://127.0.0.1:8642/health" "gateway" || true

echo "[start-all] workspace :3000"
( cd "$WORKSPACE_DIR" && npx pnpm dev ) &
pids+=($!)

echo ""
echo "[start-all] open http://localhost:3000  (Ctrl+C to stop all)"
wait
