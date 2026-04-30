#!/usr/bin/env bash
set -euo pipefail

APP_PORT="${1:-3000}"
WINDOWS_PORT="${2:-36521}"
WSL_IP="$(hostname -I | awk '{print $1}')"

if [ -z "$WSL_IP" ]; then
  echo "Could not detect WSL IP." >&2
  exit 1
fi

cat <<EOF
Run these in an elevated Windows PowerShell:

netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=${WINDOWS_PORT}
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=${WINDOWS_PORT} connectaddress=${WSL_IP} connectport=${APP_PORT}
New-NetFirewallRule -DisplayName "Kanboard WSL LAN ${WINDOWS_PORT}" -Direction Inbound -Protocol TCP -LocalPort ${WINDOWS_PORT} -Action Allow

Then access from LAN devices:
http://<WINDOWS_LAN_IP>:${WINDOWS_PORT}
EOF
