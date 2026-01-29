#!/usr/bin/env bash
set -euo pipefail

PORT="${VITE_PORT:-5173}"

echo "Checking if port ${PORT} is in use..."
while lsof -ti tcp:"${PORT}" >/dev/null 2>&1; do
  echo "Port ${PORT} is currently in use. Terminating processes:"
  mapfile -t pids < <(lsof -ti tcp:"${PORT}")
  for pid in "${pids[@]}"; do
    if ps -p "${pid}" >/dev/null 2>&1; then
      echo "  - killing PID ${pid}"
      kill "${pid}" || true
      sleep 0.5
      if lsof -ti tcp:"${PORT}" | grep -q "${pid}"; then
        echo "    PID ${pid} resisted SIGTERM, sending SIGKILL"
        kill -9 "${pid}" || true
      fi
    fi
  done
  sleep 1
done
echo "Port ${PORT} is free."

echo "Stopping any previous Vite/Electron instances..."
pkill -f "vite" >/dev/null 2>&1 || true
pkill -f "electron" >/dev/null 2>&1 || true
sleep 1

echo "Starting dev server (bun run dev)..."
VITE_PORT="${PORT}" DEV_PORT="${PORT}" bun run dev
