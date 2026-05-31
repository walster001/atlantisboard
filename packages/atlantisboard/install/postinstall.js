#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');

if (process.env.ATLANTISBOARD_SKIP_SETUP === '1' || process.env.CI === 'true') {
  console.log(
    'atlantisboard: postinstall skipped (non-interactive). Run: atlantisboard-setup',
  );
  process.exit(0);
}

if (!process.stdin.isTTY) {
  console.log(
    'atlantisboard: installed. Run `atlantisboard-setup` on the target Linux host to configure.',
  );
  process.exit(0);
}

console.log('atlantisboard: starting interactive setup (Ctrl+C to skip)...');
const setupSh = path.join(PKG_ROOT, 'install', 'setup.sh');
const child = spawn('bash', [setupSh], {
  stdio: 'inherit',
  env: { ...process.env, ATLANTISBOARD_PACKAGE_ROOT: PKG_ROOT },
});
child.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.log('atlantisboard: setup exited. Run `atlantisboard-setup` later.');
  }
});
