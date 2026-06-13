#!/usr/bin/env bash
# Build via GitHub CI + Staging (or locally), push installer package to a prod host,
# and run a non-interactive installer upgrade/repair (Docker rebuild + restart).
#
# Setup:
#   cp scripts/prod-remote-deploy.env.example scripts/prod-remote-deploy.env
#   # edit PROD_REMOTE_SSH and paths
#   chmod +x scripts/prod-staging-remote-deploy.sh
#
# Examples:
#   ./scripts/prod-staging-remote-deploy.sh
#   ./scripts/prod-staging-remote-deploy.sh --local --skip-ci
#   ./scripts/prod-staging-remote-deploy.sh --action repair --dry-run
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="${PROD_REMOTE_DEPLOY_ENV:-$SCRIPT_DIR/prod-remote-deploy.env}"
WORK_DIR="${TMPDIR:-/tmp}/atlantisboard-remote-deploy-$$"
ARTIFACT_DIR=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROD_REMOTE_SSH=""
PROD_REMOTE_INSTALL_DIR="/opt/atlantisboard"
PROD_REMOTE_PACKAGE_DIR="/tmp/atlantisboard-staging-package"
PROD_REMOTE_INSTALL_ACTION="update"
PROD_REMOTE_GIT_REF="main"
PROD_REMOTE_GITHUB_REPO="walster001/atlantisboard"
PROD_REMOTE_HEALTH_URL=""
PROD_REMOTE_SSH_OPTS=""

remote_ssh() {
  if [[ -n "$PROD_REMOTE_SSH_OPTS" ]]; then
    # shellcheck disable=SC2086
    ssh $PROD_REMOTE_SSH_OPTS "$PROD_REMOTE_SSH" "$@"
  else
    ssh "$PROD_REMOTE_SSH" "$@"
  fi
}

remote_rsync_ssh() {
  if [[ -n "$PROD_REMOTE_SSH_OPTS" ]]; then
    printf 'ssh %s' "$PROD_REMOTE_SSH_OPTS"
  else
    printf 'ssh'
  fi
}

SKIP_CI=false
SKIP_STAGING=false
LOCAL_BUILD=false
DRY_RUN=false
PUSH_FIRST=false

log() {
  printf '%s %s\n' "$(date '+%H:%M:%S')" "$*"
}

die() {
  printf '%s\n' "$*" >&2
  exit 1
}

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

Options:
  --config PATH         Env file (default: scripts/prod-remote-deploy.env)
  --ref REF             Git ref for CI/Staging (overrides config)
  --action update|repair  Remote installer action (default: update)
  --ssh user@host       Remote SSH target (overrides config)
  --install-dir PATH    Remote install dir (overrides config)
  --local               Build package locally (skip Staging workflow)
  --skip-ci             Do not wait for/trigger CI
  --skip-staging        Use existing local artifact dir (--artifact-dir required unless --local)
  --artifact-dir PATH   Use this installer tree instead of downloading
  --push                git push origin HEAD before workflows (current branch)
  --dry-run             Print steps without remote changes or workflow triggers
  -h, --help            Show help
EOF
}

load_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$CONFIG_FILE"
  elif [[ "$CONFIG_FILE" == "$SCRIPT_DIR/prod-remote-deploy.env" ]]; then
    die "Missing $CONFIG_FILE — copy scripts/prod-remote-deploy.env.example and configure PROD_REMOTE_SSH"
  fi

  [[ -n "$PROD_REMOTE_SSH" ]] || die "PROD_REMOTE_SSH is required in $CONFIG_FILE"
  case "$PROD_REMOTE_INSTALL_ACTION" in
    update | repair) ;;
    *) die "PROD_REMOTE_INSTALL_ACTION must be update or repair" ;;
  esac
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --config)
        CONFIG_FILE="$2"
        shift 2
        ;;
      --ref)
        PROD_REMOTE_GIT_REF="$2"
        shift 2
        ;;
      --action)
        PROD_REMOTE_INSTALL_ACTION="$2"
        shift 2
        ;;
      --ssh)
        PROD_REMOTE_SSH="$2"
        shift 2
        ;;
      --install-dir)
        PROD_REMOTE_INSTALL_DIR="$2"
        shift 2
        ;;
      --local)
        LOCAL_BUILD=true
        SKIP_STAGING=true
        shift
        ;;
      --skip-ci)
        SKIP_CI=true
        shift
        ;;
      --skip-staging)
        SKIP_STAGING=true
        shift
        ;;
      --artifact-dir)
        ARTIFACT_DIR="$2"
        shift 2
        ;;
      --push)
        PUSH_FIRST=true
        shift
        ;;
      --dry-run)
        DRY_RUN=true
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        die "Unknown option: $1 (use --help)"
        ;;
    esac
  done
}

require_tools() {
  local missing=()
  for cmd in git ssh rsync; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
  done
  if [[ "$LOCAL_BUILD" == true ]]; then
    command -v bun >/dev/null 2>&1 || missing+=("bun")
  fi
  if [[ "$SKIP_STAGING" != true && -z "$ARTIFACT_DIR" ]]; then
    command -v gh >/dev/null 2>&1 || missing+=("gh")
  fi
  if [[ "$SKIP_CI" != true && "$LOCAL_BUILD" != true ]]; then
    command -v gh >/dev/null 2>&1 || missing+=("gh")
  fi
  if [[ "${#missing[@]}" -gt 0 ]]; then
    die "Missing required tools: ${missing[*]}"
  fi
}

warn_git_state() {
  if [[ -n "$(git -C "$PROJECT_ROOT" status --porcelain)" ]]; then
    echo -e "${YELLOW}Warning: uncommitted changes in workspace (remote deploy uses pushed ref for CI/Staging).${NC}"
  fi
  local upstream count
  upstream="$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref '@{u}' 2>/dev/null || true)"
  if [[ -n "$upstream" ]]; then
    count="$(git -C "$PROJECT_ROOT" rev-list "${upstream}..HEAD" --count 2>/dev/null || echo 0)"
    if [[ "$count" -gt 0 ]]; then
      echo -e "${YELLOW}Warning: $count commit(s) not pushed to $upstream — workflows use remote ref, not local only.${NC}"
    fi
  fi
}

maybe_push() {
  if [[ "$PUSH_FIRST" != true ]]; then
    return 0
  fi
  local branch
  branch="$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD)"
  log "Pushing $branch to origin..."
  if [[ "$DRY_RUN" == true ]]; then
    log "[dry-run] git push origin HEAD"
    return 0
  fi
  git -C "$PROJECT_ROOT" push origin HEAD
}

resolve_head_sha() {
  git -C "$PROJECT_ROOT" rev-parse "$PROD_REMOTE_GIT_REF"
}

wait_for_workflow_run() {
  local workflow_file="$1"
  local head_sha="$2"
  local label="$3"
  local run_id="" attempt status

  if [[ "$DRY_RUN" == true ]]; then
    log "[dry-run] would trigger $label ($workflow_file) on $PROD_REMOTE_GIT_REF"
    return 0
  fi

  log "Triggering $label on ref $PROD_REMOTE_GIT_REF..."
  gh workflow run "$workflow_file" --ref "$PROD_REMOTE_GIT_REF" -R "$PROD_REMOTE_GITHUB_REPO" || \
    gh workflow run "$workflow_file" --ref "$PROD_REMOTE_GIT_REF"

  for attempt in $(seq 1 60); do
    run_id="$(gh run list \
      --workflow="$workflow_file" \
      -R "$PROD_REMOTE_GITHUB_REPO" \
      --json databaseId,headSha,status \
      -q "map(select(.headSha==\"$head_sha\")) | .[0].databaseId" 2>/dev/null || true)"
    if [[ -n "$run_id" && "$run_id" != "null" ]]; then
      status="$(gh run list \
        --workflow="$workflow_file" \
        -R "$PROD_REMOTE_GITHUB_REPO" \
        --json databaseId,headSha,status \
        -q "map(select(.headSha==\"$head_sha\")) | .[0].status" 2>/dev/null || true)"
      if [[ "$status" != "queued" || "$attempt" -gt 3 ]]; then
        break
      fi
    fi
    sleep 2
  done

  [[ -n "$run_id" && "$run_id" != "null" ]] || die "Could not find $label workflow run for $head_sha"

  log "Waiting for $label run $run_id..."
  gh run watch "$run_id" --exit-status -R "$PROD_REMOTE_GITHUB_REPO"
}

run_ci_if_needed() {
  local head_sha
  if [[ "$SKIP_CI" == true ]]; then
    log "Skipping CI (--skip-ci)"
    return 0
  fi
  head_sha="$(resolve_head_sha)"
  wait_for_workflow_run "ci.yml" "$head_sha" "CI"
}

build_local_package() {
  log "Building installer package locally..."
  if [[ "$DRY_RUN" == true ]]; then
    log "[dry-run] ./scripts/build-npm-package.sh && ./scripts/stage-release-artifact-trees.sh"
    ARTIFACT_DIR="$PROJECT_ROOT/release/staging-installer"
    return 0
  fi
  (
    cd "$PROJECT_ROOT"
    ./scripts/build-npm-package.sh
    ./scripts/stage-release-artifact-trees.sh
  )
  ARTIFACT_DIR="$PROJECT_ROOT/release/staging-installer"
  [[ -f "$ARTIFACT_DIR/atlantisboard-setup" ]] || die "Local build missing atlantisboard-setup"
}

download_staging_artifact() {
  local head_sha artifact_name run_id attempt

  if [[ -n "$ARTIFACT_DIR" ]]; then
    [[ -f "$ARTIFACT_DIR/atlantisboard-setup" ]] || die "Invalid --artifact-dir (missing atlantisboard-setup)"
    log "Using artifact dir: $ARTIFACT_DIR"
    return 0
  fi

  if [[ "$SKIP_STAGING" == true ]]; then
    die "No artifact: use --local, or --artifact-dir, or remove --skip-staging"
  fi

  head_sha="$(resolve_head_sha)"
  wait_for_workflow_run "staging.yml" "$head_sha" "Staging"

  if [[ "$DRY_RUN" == true ]]; then
    ARTIFACT_DIR="$WORK_DIR/staging-installer"
    mkdir -p "$ARTIFACT_DIR"
    return 0
  fi

  run_id="$(gh run list \
    --workflow=staging.yml \
    -R "$PROD_REMOTE_GITHUB_REPO" \
    --json databaseId,headSha,conclusion \
    -q "map(select(.headSha==\"$head_sha\" and .conclusion==\"success\")) | .[0].databaseId")"
  [[ -n "$run_id" && "$run_id" != "null" ]] || die "No successful Staging run for $head_sha"

  mkdir -p "$WORK_DIR/download"
  log "Downloading Staging artifacts from run $run_id..."
  gh run download "$run_id" -R "$PROD_REMOTE_GITHUB_REPO" -D "$WORK_DIR/download"

  artifact_name="$(find "$WORK_DIR/download" -mindepth 1 -maxdepth 1 -type d -name '*-installer' | head -1)"
  [[ -n "$artifact_name" ]] || die "Installer artifact directory not found under $WORK_DIR/download"
  ARTIFACT_DIR="$artifact_name"
  [[ -f "$ARTIFACT_DIR/atlantisboard-setup" ]] || die "Downloaded artifact missing atlantisboard-setup"
}

rsync_to_remote() {
  local rsync_ssh
  rsync_ssh="$(remote_rsync_ssh)"

  log "Syncing package to ${PROD_REMOTE_SSH}:${PROD_REMOTE_PACKAGE_DIR}/"
  if [[ "$DRY_RUN" == true ]]; then
    log "[dry-run] rsync -az --delete -e \"$rsync_ssh\" $ARTIFACT_DIR/ ${PROD_REMOTE_SSH}:${PROD_REMOTE_PACKAGE_DIR}/"
    return 0
  fi

  remote_ssh "mkdir -p '$PROD_REMOTE_PACKAGE_DIR'"
  rsync -az --delete -e "$rsync_ssh" \
    "$ARTIFACT_DIR/" "${PROD_REMOTE_SSH}:${PROD_REMOTE_PACKAGE_DIR}/"
}

run_remote_upgrade() {
  log "Running non-interactive ${PROD_REMOTE_INSTALL_ACTION} on remote..."
  if [[ "$DRY_RUN" == true ]]; then
    log "[dry-run] ssh $PROD_REMOTE_SSH sudo ./atlantisboard-setup --non-interactive ..."
    return 0
  fi

  local remote_script
  remote_script="$(cat <<REMOTE
set -euo pipefail
cd '$PROD_REMOTE_PACKAGE_DIR'
chmod +x atlantisboard-setup
export ATL_NONINTERACTIVE=1
export INSTALL_ACTION='$PROD_REMOTE_INSTALL_ACTION'
export ATLANTISBOARD_INSTALL_DIR='$PROD_REMOTE_INSTALL_DIR'
sudo -E ./atlantisboard-setup --non-interactive --action '$PROD_REMOTE_INSTALL_ACTION' --install-dir '$PROD_REMOTE_INSTALL_DIR'
REMOTE
)"

  if [[ -n "$PROD_REMOTE_SSH_OPTS" ]]; then
    # shellcheck disable=SC2086
    ssh $PROD_REMOTE_SSH_OPTS -t "$PROD_REMOTE_SSH" bash -s <<<"$remote_script"
  else
    ssh -t "$PROD_REMOTE_SSH" bash -s <<<"$remote_script"
  fi
}

remote_health_check() {
  local health_url="${PROD_REMOTE_HEALTH_URL:-}"

  if [[ "$DRY_RUN" == true ]]; then
    log "[dry-run] remote health check"
    return 0
  fi

  if [[ -z "$health_url" ]]; then
    health_url="$(remote_ssh "bash -s" "$PROD_REMOTE_INSTALL_DIR/.env" <<'EOF'
set -euo pipefail
ENV_FILE="$1"
PORT=3000
if [[ -f "$ENV_FILE" ]]; then
  app_url="$(grep -E '^APP_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  port_line="$(grep -E '^PORT=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  [[ -n "$port_line" ]] && PORT="$port_line"
  if [[ -n "$app_url" ]]; then
    printf '%s/health\n' "${app_url%/}"
    exit 0
  fi
fi
printf 'http://127.0.0.1:%s/health\n' "$PORT"
EOF
)"
  fi

  log "Health check: $health_url"
  if remote_ssh "curl -fsS --max-time 30 '$health_url' | grep -q '\"status\":\"ok\"'"; then
    echo -e "${GREEN}Health check passed${NC}"
  else
    echo -e "${YELLOW}Health check did not pass yet — container may still be starting${NC}"
  fi
}

cleanup() {
  if [[ -n "$WORK_DIR" && -d "$WORK_DIR" && "$WORK_DIR" == *atlantisboard-remote-deploy-* ]]; then
    rm -rf "$WORK_DIR"
  fi
}

main() {
  parse_args "$@"
  load_config
  require_tools
  trap cleanup EXIT

  echo -e "${BLUE}=== Atlantisboard prod remote deploy ===${NC}"
  echo "  SSH:         $PROD_REMOTE_SSH"
  echo "  Install dir: $PROD_REMOTE_INSTALL_DIR"
  echo "  Action:      $PROD_REMOTE_INSTALL_ACTION"
  echo "  Git ref:     $PROD_REMOTE_GIT_REF"
  echo "  Local build: $LOCAL_BUILD"
  echo ""

  cd "$PROJECT_ROOT"
  warn_git_state
  maybe_push

  if [[ "$LOCAL_BUILD" == true ]]; then
    build_local_package
  else
    run_ci_if_needed
    download_staging_artifact
  fi

  rsync_to_remote
  run_remote_upgrade
  remote_health_check

  echo ""
  echo -e "${GREEN}Remote deploy finished.${NC}"
  if [[ "$PROD_REMOTE_INSTALL_ACTION" == "update" ]]; then
    echo "Full-stack app image was rebuilt and restarted (data volumes preserved)."
  fi
}

main "$@"
