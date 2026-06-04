#!/usr/bin/env bun

/// <reference types="bun-types" />

/**
 * Watch script that rebuilds client with CSS preprocessing on file changes
 */

import { spawn } from 'bun';
import { watch } from 'fs';
import { join } from 'path';

const projectRoot = process.cwd();
const buildScript = join(projectRoot, 'scripts/build-client-with-css.ts');

async function main(): Promise<void> {
  console.log('👀 Watching for client changes...');
  console.log('🔄 Rebuilding on file changes...\n');

  // Initial build
  const initialBuild = spawn(['bun', 'run', buildScript], {
    cwd: projectRoot,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  await initialBuild.exited;

  // Debounce build to prevent multiple rapid rebuilds
  let buildTimeout: ReturnType<typeof setTimeout> | null = null;
  let isBuilding = false;
  const DEBOUNCE_MS = 500; // Wait 500ms after last file change before rebuilding

  // Watch for changes
  const watcher = watch(
    join(projectRoot, 'src/client'),
    { recursive: true },
    async (_eventType, filename) => {
      if (!filename || isBuilding) return;

      // Only watch relevant file types
      if (!filename.endsWith('.tsx') && !filename.endsWith('.ts') && !filename.endsWith('.css')) {
        return;
      }

      // Clear existing timeout
      if (buildTimeout) {
        clearTimeout(buildTimeout);
      }

      // Debounce the build
      buildTimeout = setTimeout(async () => {
        if (isBuilding) return;

        isBuilding = true;
        console.log(`\n📝 File changed: ${filename}`);
        console.log('🔄 Rebuilding...\n');

        try {
          const build = spawn(['bun', 'run', buildScript], {
            cwd: projectRoot,
            stdout: 'inherit',
            stderr: 'inherit',
          });

          await build.exited;
        } finally {
          isBuilding = false;
        }
      }, DEBOUNCE_MS);
    },
  );

  console.log('✅ Watch mode active. Press Ctrl+C to stop.');

  // Handle cleanup
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping watch mode...');
    watcher.close();
    process.exit(0);
  });
}

void main();
