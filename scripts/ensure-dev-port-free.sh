#!/usr/bin/env bash
# Free PORT (default 3000) when a prior bun dev server is still listening.
set -euo pipefail

PORT="${PORT:-3000}"

if ! ss -tln 2>/dev/null | grep -q ":${PORT} "; then
  exit 0
fi

pid=""
if ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
  pid="$(ss -tlnp 2>/dev/null | grep ":${PORT} " | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)"
fi

if [ -z "$pid" ]; then
  echo "Port ${PORT} is in use but could not determine the owning PID." >&2
  echo "Stop the other process or set PORT in .env." >&2
  exit 1
fi

comm="$(ps -p "$pid" -o comm= 2>/dev/null || true)"
if [ "$comm" != "bun" ]; then
  echo "Port ${PORT} is in use by PID ${pid} (${comm:-unknown}), not a bun dev server." >&2
  echo "Stop that process manually or set PORT in .env." >&2
  exit 1
fi

if [ -t 0 ]; then
  echo "Port ${PORT} is in use by bun (PID ${pid}) — likely a previous dev server."
  read -p "Stop it and continue? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
else
  echo "Stopping stale bun dev server on port ${PORT} (PID ${pid})..."
fi

# Prefer the dev.ts parent so --watch children exit cleanly.
parent="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ' || true)"
if [ -n "$parent" ] && ps -p "$parent" -o args= 2>/dev/null | grep -q 'scripts/dev.ts'; then
  kill "$parent" 2>/dev/null || true
  sleep 1
fi
kill "$pid" 2>/dev/null || true
sleep 1

if ss -tln 2>/dev/null | grep -q ":${PORT} "; then
  echo "Port ${PORT} is still in use after stopping PID ${pid}." >&2
  exit 1
fi

echo "Port ${PORT} is free."
