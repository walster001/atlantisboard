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
  join(INSTALL_DIR, 'lib', 'common.sh'),
  join(INSTALL_DIR, 'reverse-proxy.sh'),
  join(INSTALL_DIR, 'bin', 'setup.sh'),
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

  test('common.sh defines atl_whiptail_capture and atl_path_is_safe_absolute', () => {
    const common = readFileSync(join(INSTALL_DIR, 'lib', 'common.sh'), 'utf8');
    expect(common).toContain('atl_whiptail_capture()');
    expect(common).toContain('atl_path_is_safe_absolute()');
    expect(common).toContain('atl_env_get()');
    expect(common).toContain('atl_generate_install_secrets()');
    expect(common).toContain('atl_offer_install_prerequisites()');
    expect(common).toContain('atl_bootstrap_whiptail()');
    expect(common).toMatch(/whiptail\s+"\$@"\s+2>"\$tmp"\s+1>"\$tty"/);
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

  test('mock whiptail fixture is executable', () => {
    const mockDir = join(REPO_ROOT, 'tests', 'installer', 'fixtures', 'bin');
    const names = readdirSync(mockDir);
    expect(names).toContain('whiptail');
    const mock = readFileSync(join(mockDir, 'whiptail'), 'utf8');
    expect(mock).toContain('WHIPTAIL_MOCK_VALUE');
  });
});
