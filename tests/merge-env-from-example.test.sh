#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TEST_DIR/.." && pwd)"
MERGE_SCRIPT="$REPO_ROOT/scripts/merge-env-from-example.sh"
DEDUPE_SCRIPT="$REPO_ROOT/scripts/dedupe-env-file.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
  echo "merge-env-from-example.test: $*" >&2
  exit 1
}

[[ -x "$MERGE_SCRIPT" ]] || fail "missing merge script"
[[ -x "$DEDUPE_SCRIPT" ]] || fail "missing dedupe script"

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

# export / spaced assignments count as present
cat > "$TEMPLATE" <<'EOF'
JWT_SECRET=from_template
CSRF_SECRET=csrf_template
EOF
cat > "$TARGET" <<'EOF'
export JWT_SECRET=real_jwt
CSRF_SECRET = real_csrf
EOF
output3="$("$MERGE_SCRIPT" --template "$TEMPLATE" --target "$TARGET" 2>&1)"
[[ "$output3" == *"no new variables"* ]] || fail "export/spaced keys should be detected as present: $output3"
grep -q '^JWT_SECRET=' "$TARGET" && fail "should not append duplicate JWT_SECRET"
grep -q '^CSRF_SECRET=' "$TARGET" && fail "should not append duplicate CSRF_SECRET"

# Missing target: skip by default (production-safe)
TARGET2="$WORK/missing.env"
output4="$("$MERGE_SCRIPT" --template "$TEMPLATE" --target "$TARGET2" 2>&1)"
[[ "$output4" == *"skipping merge"* ]] || fail "expected skip when target missing"
[[ ! -f "$TARGET2" ]] || fail "should not create target without --allow-create"

# Missing target: explicit create
output5="$("$MERGE_SCRIPT" --template "$TEMPLATE" --target "$TARGET2" --allow-create 2>&1)"
[[ "$output5" == *"Created"* ]] || fail "expected create message"
[[ -f "$TARGET2" ]] || fail "target not created"
stat -c '%a' "$TARGET2" | grep -qE '600' || fail "expected mode 600"

# Dedupe keeps first assignment
cat > "$TARGET" <<'EOF'
JWT_SECRET=keep_first
SESSION_SECRET=session_keep
JWT_SECRET=placeholder_from_merge
SESSION_SECRET=placeholder_from_merge
EOF
dedupe_out="$("$DEDUPE_SCRIPT" --target "$TARGET" 2>&1)"
[[ "$dedupe_out" == *"Removed 2"* ]] || fail "dedupe should remove 2 lines: $dedupe_out"
grep -q '^JWT_SECRET=keep_first$' "$TARGET" || fail "first JWT kept"
grep -q '^SESSION_SECRET=session_keep$' "$TARGET" || fail "first SESSION kept"
! grep -q 'placeholder_from_merge' "$TARGET" || fail "duplicate placeholders should be removed"

echo "merge-env-from-example.test: all checks passed"
