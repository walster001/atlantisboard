import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();
const APPLY = join(ROOT, 'scripts', 'apply-nginx-config-update.sh');
const NGINX_SRC = join(ROOT, 'deploy', 'nginx');

function apply(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('bash', [APPLY, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: `${result.stdout}${result.stderr}`,
    stderr: result.stderr,
  };
}

const INSTALLER_SITE = `upstream atlantisboard_app {
    server 127.0.0.1:3000;
}

server {
    location /socket.io/ {
        proxy_pass http://atlantisboard_app;
    }

    location / {
        proxy_pass http://atlantisboard_app;
    }
}
`;

describe('apply-nginx-config-update', () => {
  test('copies kanboard sample site and snippet', () => {
    const work = mkdtempSync(join(tmpdir(), 'nginx-apply-'));
    const site = join(work, 'kanboard.conf');
    const snippet = join(work, 'snippets', 'kanboard-proxy.conf');
    writeFileSync(site, '# previous site\n');

    const result = apply([
      '--src',
      NGINX_SRC,
      '--site',
      site,
      '--snippet',
      snippet,
      '--skip-nginx-test',
      '--skip-reload',
    ]);
    expect(result.status).toBe(0);

    const dest = readFileSync(site, 'utf8');
    expect(dest).toContain('location ^~ /api/v1/admin/backup/import');
    expect(dest).toContain('client_max_body_size 100g');
    expect(dest).toContain('proxy_request_buffering off');
    expect(readFileSync(snippet, 'utf8')).toContain('proxy_set_header Host $host');
  });

  test('upserts backup-import location into installer-style site and stays idempotent', () => {
    const work = mkdtempSync(join(tmpdir(), 'nginx-apply-'));
    const site = join(work, 'atlantisboard');
    writeFileSync(site, INSTALLER_SITE);

    const first = apply(['--site', site, '--skip-nginx-test', '--skip-reload']);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('upserting backup-import location');

    const dest = readFileSync(site, 'utf8');
    expect(dest).toContain('location ^~ /api/v1/admin/backup/import');
    expect(dest).toContain('proxy_pass http://atlantisboard_app');
    expect(dest.indexOf('backup/import')).toBeLessThan(dest.indexOf('location / {'));

    const second = apply(['--site', site, '--skip-nginx-test', '--skip-reload']);
    expect(second.status).toBe(0);
    const dest2 = readFileSync(site, 'utf8');
    expect(dest2.split('location ^~ /api/v1/admin/backup/import').length).toBe(2);
  });

  test('detects kanboard site under --nginx-root', () => {
    const work = mkdtempSync(join(tmpdir(), 'nginx-apply-'));
    const enabled = join(work, 'sites-enabled');
    mkdirSync(enabled, { recursive: true });
    const site = join(enabled, 'kanboard');
    writeFileSync(
      site,
      'upstream kanboard_app {\n    server kanboard-app:3000;\n}\nserver { location / { proxy_pass http://kanboard_app; } }\n',
    );

    const result = apply([
      '--src',
      NGINX_SRC,
      '--detect',
      '--nginx-root',
      work,
      '--skip-nginx-test',
      '--skip-reload',
    ]);
    expect(result.status).toBe(0);
    expect(readFileSync(site, 'utf8')).toContain('client_max_body_size 100g');
  });

  test('detect with no matching site exits 0', () => {
    const work = mkdtempSync(join(tmpdir(), 'nginx-apply-'));
    mkdirSync(join(work, 'sites-enabled'), { recursive: true });
    const result = apply([
      '--src',
      NGINX_SRC,
      '--detect',
      '--nginx-root',
      work,
      '--skip-nginx-test',
      '--skip-reload',
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('skipping');
  });
});
