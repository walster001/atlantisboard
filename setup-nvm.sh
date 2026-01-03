#!/bin/bash
# Setup script to configure nvm for this project
# Source this file before running npm commands: source setup-nvm.sh

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Unset npm_config_prefix to avoid conflicts with nvm
unset npm_config_prefix

# Auto-use .nvmrc if it exists
if [ -f .nvmrc ]; then
  nvm use
  echo "✓ Using Node.js $(node --version) and npm $(npm --version)"
else
  echo "⚠ No .nvmrc file found"
fi

