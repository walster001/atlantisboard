#!/usr/bin/env bash
# Remove Atlantisboard installer Docker volumes for a clean reinstall.
# Use when .env secrets were regenerated but containers still have old passwords.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ATLANTISBOARD_ENV_FILE:-${SCRIPT_DIR}/../../.env}"
MODE="${1:-}"

usage() {
  cat <<EOF
Usage: $(basename "$0") <deps|fullstack>

Stops the Compose stack and deletes named volumes (MongoDB, Redis, MinIO, ClamAV data).

  deps      — docker-compose.deps.yml (Docker dependencies only)
  fullstack — docker-compose.fullstack.yml

Set ATLANTISBOARD_ENV_FILE to point at your install .env if not ../../.env
EOF
  exit 1
}

[[ "$MODE" == "deps" || "$MODE" == "fullstack" ]] || usage

COMPOSE_FILE="docker-compose.${MODE}.yml"
if [[ ! -f "${SCRIPT_DIR}/${COMPOSE_FILE}" ]]; then
  echo "Compose file not found: ${SCRIPT_DIR}/${COMPOSE_FILE}" >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
else
  COMPOSE=(docker-compose)
fi

ENV_ARGS=()
[[ -f "$ENV_FILE" ]] && ENV_ARGS=(--env-file "$ENV_FILE")

echo "Stopping ${MODE} stack and removing volumes (env: ${ENV_FILE})..."
(cd "$SCRIPT_DIR" && "${COMPOSE[@]}" "${ENV_ARGS[@]}" -f "$COMPOSE_FILE" down -v)
echo "Done. Re-run atlantisboard-setup or: docker compose -f ${COMPOSE_FILE} up -d"
