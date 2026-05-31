#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '../..');

function usage() {
  console.log(`Atlantisboard CLI

Usage:
  atlantisboard setup   Run interactive installer (Whiptail, Linux)
  atlantisboard start   Start the HTTP server (requires Bun)
  atlantisboard worker  Start the background worker process

Environment:
  ATLANTISBOARD_INSTALL_DIR  Target install directory (setup only)
`);
}

function runBun(scriptRel, extraArgs = []) {
  const script = path.join(PKG_ROOT, scriptRel);
  if (!fs.existsSync(script)) {
    console.error(`error: missing ${script}. Reinstall the atlantisboard package.`);
    process.exit(1);
  }
  const child = spawn('bun', ['run', script, ...extraArgs], {
    cwd: PKG_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 1));
}

const cmd = process.argv[2];
switch (cmd) {
  case 'setup':
  case undefined: {
    const setupSh = path.join(PKG_ROOT, 'install', 'setup.sh');
    const child = spawn('bash', [setupSh, ...process.argv.slice(3)], {
      stdio: 'inherit',
      env: { ...process.env, ATLANTISBOARD_PACKAGE_ROOT: PKG_ROOT },
    });
    child.on('exit', (code) => process.exit(code ?? 1));
    break;
  }
  case 'start':
    runBun('dist/server/index.js');
    break;
  case 'worker':
    runBun('dist/workers/index.js');
    break;
  case 'help':
  case '--help':
  case '-h':
    usage();
    break;
  default:
    console.error(`Unknown command: ${cmd}`);
    usage();
    process.exit(1);
}
