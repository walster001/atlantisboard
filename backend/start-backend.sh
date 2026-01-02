#!/bin/bash
# Start backend with correct Node version
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")"
nvm use 22 || nvm use 20 || nvm use default
npm run dev

