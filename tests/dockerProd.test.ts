import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();
const INSTALL_ENTRYPOINT = join(
  REPO_ROOT,
  'packages',
  'atlantisboard',
  'install',
  'docker',
  'entrypoint.sh',
);

describe('repo-root production Docker', () => {
  test('Dockerfile production target includes ClamAV and entrypoint', () => {
    const dockerfile = readFileSync(join(REPO_ROOT, 'Dockerfile'), 'utf8');
    expect(dockerfile).toContain('AS production');
    expect(dockerfile).toContain('clamav');
    expect(dockerfile).toContain('su-exec');
    expect(dockerfile).toContain('/opt/clamav-seed');
    expect(dockerfile).toContain('COPY docker/entrypoint.sh /entrypoint.sh');
    expect(dockerfile).toContain('ENTRYPOINT ["/entrypoint.sh"]');
    expect(dockerfile).toContain('CLAMAV_DB_DIR=/var/lib/clamav');
  });

  test('docker-compose.prod.yml mounts ClamAV signatures volume', () => {
    const compose = readFileSync(join(REPO_ROOT, 'docker-compose.prod.yml'), 'utf8');
    expect(compose).toContain('target: production');
    expect(compose).toContain('clamav-sigs-prod');
    expect(compose).toContain('CLAMAV_DB_DIR: /var/lib/clamav');
    expect(compose).toContain('POMPELMI_SKIP_SCAN: ${POMPELMI_SKIP_SCAN:-false}');
    expect(compose).toContain('POMPELMI_FAIL_OPEN: ${POMPELMI_FAIL_OPEN:-false}');
    expect(compose).not.toMatch(/\n  clamav:/);
    expect(compose).not.toContain('POMPELMI_CLAMD_HOST');
  });

  test('repo-root entrypoint matches installer fullstack entrypoint', () => {
    const repoEntrypoint = readFileSync(join(REPO_ROOT, 'docker', 'entrypoint.sh'), 'utf8');
    const installEntrypoint = readFileSync(INSTALL_ENTRYPOINT, 'utf8');
    expect(repoEntrypoint).toBe(installEntrypoint);
  });
});
