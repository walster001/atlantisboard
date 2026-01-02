#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")"
nvm use 22 2>/dev/null || nvm use 20 2>/dev/null || true

echo "Rebuilding native dependencies..."
npm rebuild bcrypt
npm rebuild

echo "Done!"

