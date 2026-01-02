#!/bin/bash
# Script to fix AuthRequest type issues in route files
# Replaces 'req: AuthRequest' with 'req: Request' and adds cast

cd "$(dirname "$0")/.."

# List of route files to fix
FILES=(
  "src/routes/admin.ts"
  "src/routes/app-settings.ts"
  "src/routes/auth.ts"
  "src/routes/board-import.ts"
  "src/routes/cards.ts"
  "src/routes/columns.ts"
  "src/routes/db.ts"
  "src/routes/home.ts"
  "src/routes/invites.ts"
  "src/routes/labels.ts"
  "src/routes/members.ts"
  "src/routes/rpc.ts"
  "src/routes/storage.ts"
  "src/routes/subtasks.ts"
  "src/routes/workspaces.ts"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing $file..."
    # This is a placeholder - actual fixes need to be done manually
    # as each handler needs individual attention
  fi
done

echo "Done. Please review and fix handlers individually."

