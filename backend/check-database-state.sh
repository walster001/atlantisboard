#!/bin/bash
# Check database state
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")"

nvm use 20 2>/dev/null || nvm use 22 2>/dev/null || true

node check-database-state.mjs

