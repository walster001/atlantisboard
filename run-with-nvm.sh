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
fi

# Run the command passed as arguments
exec "$@"

