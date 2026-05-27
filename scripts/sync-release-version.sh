#!/usr/bin/env bash
# Set root and packages/atlantisboard package.json version (production release).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: scripts/sync-release-version.sh <semver>" >&2
  exit 1
fi

cd "$PROJECT_ROOT"
bun -e "
const version = process.argv[1];
if (!/^\\d+\\.\\d+\\.\\d+(-[0-9A-Za-z.-]+)?(\\+[0-9A-Za-z.-]+)?\$/.test(version)) {
  console.error('error: invalid semver:', version);
  process.exit(1);
}
for (const file of ['package.json', 'packages/atlantisboard/package.json']) {
  const pkg = await Bun.file(file).json();
  pkg.version = version;
  await Bun.write(file, JSON.stringify(pkg, null, 2) + '\\n');
}
console.log('Synced version', version, 'to package.json files');
" "$VERSION"
