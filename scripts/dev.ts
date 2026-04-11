#!/usr/bin/env bun

/**
 * Development script that runs both server and client build watcher
 * This ensures the client is built and kept up-to-date during development
 *
 * Per-process heap caps (NODE_OPTIONS) keep total dev RAM ~≤6 GiB with docker-compose limits.
 */

import { spawn } from 'bun';
import { existsSync } from 'fs';
import { join } from 'path';

/** MiB — tuned with docker-compose service limits (~2.75 GiB) for ≤~6 GiB total dev usage. */
const HEAP_MB = {
  twemojiSync: 512,
  initialClientBuild: 1024,
  clientWatcher: 1024,
  serverWatch: 1536,
} as const;

function envWithMaxOldSpaceMiB(maxMiB: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  out.NODE_OPTIONS = `--max-old-space-size=${maxMiB}`;
  return out;
}

const projectRoot = process.cwd();

console.log('🙂 Twemoji assets…');
const twemojiProc = spawn(['bun', 'run', join(projectRoot, 'scripts/sync-twemoji-assets.ts')], {
  cwd: projectRoot,
  stdout: 'inherit',
  stderr: 'inherit',
  env: envWithMaxOldSpaceMiB(HEAP_MB.twemojiSync),
});
await twemojiProc.exited;
if (twemojiProc.exitCode !== 0) {
  console.warn(
    '⚠️  Twemoji sync failed — run `bun run scripts/sync-twemoji-assets.ts` for local emoji PNGs.',
  );
}
const publicDir = join(projectRoot, 'public');
const indexJsPath = join(publicDir, 'index.js');

// Check if client needs to be built first
if (!existsSync(indexJsPath)) {
  console.log('🔨 Building client for the first time...');
  const buildProcess = spawn(
    [
      'bun',
      'build',
      'src/client/index.tsx',
      '--outdir',
      'public',
      '--target',
      'browser',
      '--external',
      'mongoose',
      '--external',
      'ioredis',
      '--external',
      'mongodb',
      '--external',
      'minio',
      '--external',
      'express',
      '--external',
      'socket.io',
      '--external',
      'passport',
    ],
    {
      cwd: projectRoot,
      stdout: 'inherit',
      stderr: 'inherit',
      env: envWithMaxOldSpaceMiB(HEAP_MB.initialClientBuild),
    },
  );

  await buildProcess.exited;
  if (buildProcess.exitCode !== 0) {
    console.error('❌ Failed to build client');
    process.exit(1);
  }
  console.log('✅ Client built successfully\n');
}

// Start client build watcher (with CSS preprocessing)
console.log('👀 Starting client build watcher...');
const clientWatcher = spawn(['bun', 'run', 'scripts/build-client-watch.ts'], {
  cwd: projectRoot,
  stdout: 'inherit',
  stderr: 'inherit',
  env: envWithMaxOldSpaceMiB(HEAP_MB.clientWatcher),
});

// Start server
console.log('🚀 Starting development server...\n');
const server = spawn(['bun', 'run', '--watch', 'src/server/index.ts'], {
  cwd: projectRoot,
  stdout: 'inherit',
  stderr: 'inherit',
  env: envWithMaxOldSpaceMiB(HEAP_MB.serverWatch),
});

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  clientWatcher.kill();
  server.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down...');
  clientWatcher.kill();
  server.kill();
  process.exit(0);
});

// Wait for both processes
await Promise.all([
  clientWatcher.exited,
  server.exited,
]);
