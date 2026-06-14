#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TEST_DIR/.." && pwd)"
MERGE_SCRIPT="$REPO_ROOT/scripts/merge-env-from-example.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
  echo "merge-env-from-example.test: $*" >&2
  exit 1
}

[[ -x "$MERGE_SCRIPT" ]] || fail "missing merge script"

TEMPLATE="$WORK/template.env"
TARGET="$WORK/target.env"

cat > "$TEMPLATE" <<'EOF'
# comment line
EXISTING_KEY=from_template
NEW_KEY_A=default_a
NEW_KEY_B=default_b
EOF

cat > "$TARGET" <<'EOF'
EXISTING_KEY=keep_me
OTHER=untouched
EOF

chmod 600 "$TARGET"

output="$("$MERGE_SCRIPT" --template "$TEMPLATE" --target "$TARGET" 2>&1)" || fail "merge failed"

echo "$output" | grep -q 'NEW_KEY_A' || fail "expected log for NEW_KEY_A"
echo "$output" | grep -q 'NEW_KEY_B' || fail "expected log for NEW_KEY_B"
echo "$output" | grep -q 'EXISTING_KEY' && fail "should not log existing key"

grep -q '^EXISTING_KEY=keep_me$' "$TARGET" || fail "existing value was overwritten"
grep -q '^OTHER=untouched$' "$TARGET" || fail "unrelated line changed"
grep -q '^NEW_KEY_A=default_a$' "$TARGET" || fail "NEW_KEY_A not appended"
grep -q '^NEW_KEY_B=default_b$' "$TARGET" || fail "NEW_KEY_B not appended"
grep -q '^# --- Added by merge-env-from-example' "$TARGET" || fail "missing merge header"

# Second run: no new variables
output2="$("$MERGE_SCRIPT" --template "$TEMPLATE" --target "$TARGET" 2>&1)"
[[ "$output2" == *"no new variables"* ]] || fail "expected no new variables on second run"

# Missing target: copy template
TARGET2="$WORK/new.env"
output3="$("$MERGE_SCRIPT" --template "$TEMPLATE" --target "$TARGET2" 2>&1)"
[[ "$output3" == *"Created"* ]] || fail "expected create message"
[[ -f "$TARGET2" ]] || fail "target not created"
stat -c '%a' "$TARGET2" | grep -qE '600' || fail "expected mode 600"

echo "merge-env-from-example.test: all checks passed"
