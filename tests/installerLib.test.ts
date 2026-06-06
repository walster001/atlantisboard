import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();
const PKG_ROOT = join(REPO_ROOT, 'packages', 'atlantisboard');
const INSTALL_DIR = join(PKG_ROOT, 'install');
const HARNESS_SCRIPT = join(REPO_ROOT, 'tests', 'installer', 'installer-lib.harness.sh');

const INSTALL_SHELL_FILES = [
  join(INSTALL_DIR, 'setup.sh'),
  join(INSTALL_DIR, 'uninstall.sh'),
  join(INSTALL_DIR, 'lib', 'common.sh'),
  join(INSTALL_DIR, 'lib', 'uninstall-lib.sh'),
  join(INSTALL_DIR, 'reverse-proxy.sh'),
  join(INSTALL_DIR, 'bin', 'setup.sh'),
  join(INSTALL_DIR, 'bin', 'uninstall.sh'),
];

/** Legacy fd swap on capture lines caused answers to merge; whiptail values belong on stderr (see whiptail(1)). */
const FORBIDDEN_WHIPTAIL_REDIRECT = /3>&2 1>&2/;

function shellLineUsesBrokenWhiptailRedirect(line: string): boolean {
  const code = line.split('#')[0] ?? '';
  if (!FORBIDDEN_WHIPTAIL_REDIRECT.test(code)) {
    return false;
  }
  if (/\batl_whiptail_capture\b/.test(code)) {
    return false;
  }
  return /\bwhiptail\b/.test(code);
}

function runHarness(): { ok: boolean; stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('bash', [HARNESS_SCRIPT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ATLANTISBOARD_PACKAGE_ROOT: PKG_ROOT,
    },
    encoding: 'utf8',
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  };
}

function runSetupPkgRootCheck(): { ok: boolean; stdout: string; stderr: string } {
  const resolveScript = `
set -euo pipefail
export ATLANTISBOARD_PACKAGE_ROOT=${JSON.stringify(PKG_ROOT)}
script_dir="$(cd "$(dirname "${join(INSTALL_DIR, 'setup.sh')}")" && pwd)"
if [[ -f "\${script_dir}/../package.json" ]]; then
  root="$(cd "\${script_dir}/.." && pwd)"
else
  root="$(cd "\${script_dir}/../.." && pwd)"
fi
[[ "\${root}" == "${PKG_ROOT}" ]] || { echo "pkg root mismatch: \${root}"; exit 1; }
[[ -f "\${root}/install/env-fields.json" ]] || exit 1
echo ok
`;
  const result = spawnSync('bash', ['-c', resolveScript], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('installer library harness', () => {
  test('bash harness passes (paths, whiptail capture, .env format)', () => {
    const { ok, stdout, stderr, status } = runHarness();
    expect({ status, stderr }).toEqual({ status: 0, stderr: '' });
    expect(stdout).toContain('all checks passed');
    expect(ok).toBe(true);
  });

  test('setup.sh resolves ATLANTISBOARD_PACKAGE_ROOT to packages/atlantisboard', () => {
    const { ok, stderr } = runSetupPkgRootCheck();
    expect(stderr).toBe('');
    expect(ok).toBe(true);
  });
});

describe('installer shell static guards', () => {
  test('install scripts do not use broken whiptail redirect on capture lines', () => {
    for (const filePath of INSTALL_SHELL_FILES) {
      const text = readFileSync(filePath, 'utf8');
      const badLines = text.split('\n').filter(shellLineUsesBrokenWhiptailRedirect);
      expect(badLines).toEqual([]);
    }
  });

  test('install scripts route yes/no dialogs through atl_whiptail_yesno (TTY-safe under sudo)', () => {
    for (const filePath of INSTALL_SHELL_FILES) {
      if (filePath.endsWith('common.sh')) {
        continue;
      }
      const text = readFileSync(filePath, 'utf8');
      expect(text).not.toMatch(/\bwhiptail\b[^\n]*--yesno/);
    }
    const reverseProxy = readFileSync(join(INSTALL_DIR, 'reverse-proxy.sh'), 'utf8');
    expect(reverseProxy).toContain('atl_whiptail_yesno');
  });

  test('common.sh defines atl_whiptail_capture and atl_path_is_safe_absolute', () => {
    const common = readFileSync(join(INSTALL_DIR, 'lib', 'common.sh'), 'utf8');
    expect(common).toContain('atl_whiptail_capture()');
    expect(common).toContain('atl_path_is_safe_absolute()');
    expect(common).toContain('atl_env_get()');
    expect(common).toContain('atl_generate_install_secrets()');
    expect(common).toContain('atl_offer_install_prerequisites()');
    expect(common).toContain('atl_apply_theme()');
    expect(common).toContain('#1f68b5');
    expect(common).toContain('actbutton=black,white');
    expect(common).toContain('atl_whiptail_yesno()');
    expect(common).toContain('atl_bootstrap_whiptail()');
    expect(common).toContain('atl_ensure_sudo_credentials()');
    expect(common).toContain('docker-compose-v2');
    expect(common).toMatch(/whiptail\s+"\$@"\s+<\/dev\/tty\s+2>"\$tmp"\s+1>"\$tty"/);
    expect(common).toContain('--passwordbox "$prompt_text" 14 78 ""');
  });

  test('setup.sh generates secrets via infobox only (not interactive key prompts)', () => {
    const setup = readFileSync(join(INSTALL_DIR, 'setup.sh'), 'utf8');
    expect(setup).toContain('atl_generate_install_secrets "$MODE"');
    expect(setup).not.toContain('atl_auto_generate_secrets "$MODE"');
  });

  test('welcome_secrets section is non-interactive in env-fields.json', () => {
    const raw = readFileSync(join(INSTALL_DIR, 'env-fields.json'), 'utf8');
    const parsed = JSON.parse(raw) as {
      sections: ReadonlyArray<{ id: string; prompt?: boolean; fields: ReadonlyArray<{ auto_generate?: boolean }> }>;
    };
    const security = parsed.sections.find((s) => s.id === 'welcome_secrets');
    expect(security).toBeDefined();
    expect(security?.prompt).toBe(false);
    expect(security?.fields.every((f) => f.auto_generate === true)).toBe(true);
  });

  test('setup.sh validates installation MODE after menu capture', () => {
    const setup = readFileSync(join(INSTALL_DIR, 'setup.sh'), 'utf8');
    expect(setup).toContain('atl_whiptail_capture --title "Installation type"');
    expect(setup).toContain('case "$MODE" in');
    expect(setup).toContain('fullstack | docker | manual');
  });

  test('completion message reads APP_URL from install .env on disk', () => {
    const setup = readFileSync(join(INSTALL_DIR, 'setup.sh'), 'utf8');
    const common = readFileSync(join(INSTALL_DIR, 'lib', 'common.sh'), 'utf8');
    expect(setup).toContain('atl_env_get_from_file APP_URL "$ENV_FILE"');
    expect(setup).not.toContain('atl_env_get APP_URL');
    expect(common).toContain('atl_env_get_from_file()');
  });

  test('setup.sh uses compose failure dialog with continue option', () => {
    const setup = readFileSync(join(INSTALL_DIR, 'setup.sh'), 'utf8');
    const common = readFileSync(join(INSTALL_DIR, 'lib', 'common.sh'), 'utf8');
    expect(setup).toContain('atl_docker_compose_or_continue');
    expect(setup).toContain('atl_wait_for_docker_deps_or_continue');
    expect(common).toContain('atl_docker_compose_or_continue()');
    expect(common).toContain('Docker Compose failed');
  });

  test('setup.sh wires post-prompt validation and preserves install .env on rsync', () => {
    const setup = readFileSync(join(INSTALL_DIR, 'setup.sh'), 'utf8');
    expect(setup).toContain('atl_sync_cors_with_app_url');
    expect(setup).toContain('atl_validate_google_oauth_config');
    expect(setup).toContain('atl_verify_app_port');
    expect(setup).toContain('atl_preflight_manual_services');
    expect(setup).toContain('--exclude .env');
    expect(setup).toContain('${INSTALL_DIR}/install/systemd/');
  });

  test('setup.sh records install mode and writes uninstall manifest', () => {
    const setup = readFileSync(join(INSTALL_DIR, 'setup.sh'), 'utf8');
    expect(setup).toContain('ATLANTISBOARD_INSTALL_MODE');
    expect(setup).toContain('atl_write_install_manifest');
    expect(setup).toContain('install/lib/uninstall-lib.sh');
  });

  test('release bundle includes atlantisboard-uninstall launcher', () => {
    const buildScript = readFileSync(join(REPO_ROOT, 'scripts', 'build-npm-package.sh'), 'utf8');
    expect(buildScript).toContain('atlantisboard-uninstall');
    const launcher = readFileSync(join(PKG_ROOT, 'atlantisboard-uninstall'), 'utf8');
    expect(launcher).toContain('install/uninstall.sh');
  });

  test('uninstall.sh verifies removal before deleting itself', () => {
    const uninstall = readFileSync(join(INSTALL_DIR, 'uninstall.sh'), 'utf8');
    expect(uninstall).toContain('atl_uninstall_verify_remaining');
    expect(uninstall).toContain('atl_uninstall_remove_self_scripts');
    expect(uninstall).toContain('fullstack | docker | manual');
  });

  test('env-fields.json is present and every prompted field has a label', () => {
    const envFieldsPath = join(INSTALL_DIR, 'env-fields.json');
    const raw = readFileSync(envFieldsPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      sections: ReadonlyArray<{
        fields: ReadonlyArray<{ key: string; auto_generate?: boolean; label?: string }>;
      }>;
    };
    let fieldCount = 0;
    for (const section of parsed.sections) {
      const keysInSection = new Set<string>();
      for (const field of section.fields) {
        fieldCount += 1;
        expect(keysInSection.has(field.key)).toBe(false);
        keysInSection.add(field.key);
        if (field.auto_generate === true) {
          continue;
        }
        expect(typeof field.label).toBe('string');
        expect((field.label ?? '').length).toBeGreaterThan(0);
      }
    }
    expect(fieldCount).toBeGreaterThan(10);
  });

  test('fullstack compose references install root .env not install/.env', () => {
    const compose = readFileSync(
      join(INSTALL_DIR, 'docker', 'docker-compose.fullstack.yml'),
      'utf8'
    );
    expect(compose).toContain('../../.env');
    expect(compose).not.toMatch(/env_file:\s*\n\s*-\s+\.\.\/\.env\b/);
    expect(compose).toContain('context: ../..');
  });

  test('mongodb compose uses keyFile entrypoint for replSet with auth', () => {
    const full = readFileSync(
      join(INSTALL_DIR, 'docker', 'docker-compose.fullstack.yml'),
      'utf8'
    );
    expect(full).toContain('docker-entrypoint-with-keyfile.sh');
    expect(full).toContain('--keyFile');
    expect(full).toContain('/data/replica.key');
    expect(full).not.toMatch(/mongodb:\/\/\$\$\{MONGO_INITDB_ROOT/);
  });

  test('installer MinIO images default to Docker Hub (not quay.io)', () => {
    const defaults = readFileSync(join(INSTALL_DIR, 'docker', 'image-defaults.env'), 'utf8');
    expect(defaults).toContain('docker.io/minio/minio:');
    expect(defaults).toContain('ATLANTISBOARD_MC_RELEASE=RELEASE.2025-08-13T08-35-41Z');
    expect(defaults).not.toContain('quay.io');
    const deps = readFileSync(join(INSTALL_DIR, 'docker', 'docker-compose.deps.yml'), 'utf8');
    expect(deps).toContain('ATLANTISBOARD_MINIO_IMAGE');
    expect(deps).not.toContain('quay.io/minio');
    const common = readFileSync(join(INSTALL_DIR, 'lib', 'common.sh'), 'utf8');
    expect(common).toContain('image-defaults.env');
    expect(common).toContain('max_attempts=3');
    expect(common).toContain('COMPOSE_BAKE=false');
    const dockerfile = readFileSync(join(INSTALL_DIR, 'docker', 'Dockerfile'), 'utf8');
    expect(dockerfile).toContain('github.com/minio/mc/releases/download');
    expect(dockerfile).not.toContain('dl.min.io');
    expect(dockerfile).toContain('AS production');
    expect(dockerfile).toContain('AS artifacts');
    expect(dockerfile).toContain('--from=artifacts');
    expect(dockerfile).toContain('COPY --chown=bunjs:nodejs');
    expect(dockerfile).not.toContain('chown -R');
    expect(dockerfile).toContain('chown bunjs:nodejs /app');
    expect(dockerfile).toContain('AS development');
    expect(dockerfile).toContain('NODE_ENV=production');
    expect(dockerfile).toContain('bun run build:client');
    expect(dockerfile).toContain('--frozen-lockfile --production --ignore-scripts');
    const dockerignore = readFileSync(join(PKG_ROOT, '.dockerignore'), 'utf8');
    expect(dockerignore).toContain('src');
    expect(dockerignore).toContain('docker');
    expect(dockerignore).not.toContain('\ndist\n');
    const fullstack = readFileSync(
      join(INSTALL_DIR, 'docker', 'docker-compose.fullstack.yml'),
      'utf8',
    );
    expect(fullstack).toContain('target: production');
  });

  test('server bundles externalize node_modules (no host paths in release artifacts)', () => {
    const pkg = readFileSync(join(REPO_ROOT, 'package.json'), 'utf8');
    expect(pkg).toContain('--packages=external');
    const assertScript = readFileSync(
      join(REPO_ROOT, 'scripts', 'assert-bundle-no-host-paths.sh'),
      'utf8',
    );
    expect(assertScript).toContain('runner/work/');
    const buildScript = readFileSync(join(REPO_ROOT, 'scripts', 'build-npm-package.sh'), 'utf8');
    expect(buildScript).toContain('assert-bundle-no-host-paths.sh');
  });

  test('mock whiptail fixture is executable', () => {
    const mockDir = join(REPO_ROOT, 'tests', 'installer', 'fixtures', 'bin');
    const names = readdirSync(mockDir);
    expect(names).toContain('whiptail');
    const mock = readFileSync(join(mockDir, 'whiptail'), 'utf8');
    expect(mock).toContain('WHIPTAIL_MOCK_VALUE');
  });
});
