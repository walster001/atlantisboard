#!/bin/bash
# Wrapper script to ensure nvm is loaded before running npm commands
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Unset npm_config_prefix to avoid conflicts with nvm
unset npm_config_prefix

# Auto-use .nvmrc if it exists
if [ -f .nvmrc ]; then
  nvm use
  # Ensure the new node version is in PATH
  export PATH="$NVM_DIR/versions/node/$(nvm version)/bin:$PATH"
fi

# Add node_modules/.bin to PATH so local binaries can be found
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$SCRIPT_DIR/node_modules/.bin:$PATH"

# Run the command passed as arguments
exec "$@"

