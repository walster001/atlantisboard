#!/usr/bin/env bun

/**
 * Build client with CSS preprocessing through Tailwind v4 CLI
 * This ensures Tailwind utilities are generated before Bun bundles
 */

import { spawn } from 'bun';
import { spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';
import { syncEmojiSpritesheetToPublic } from './sync-emoji-spritesheet-to-public.js';

interface TailwindPostcssOptions {
  readonly base?: string;
  readonly optimize?: boolean | { readonly minify?: boolean };
  readonly transformAssetUrls?: boolean;
}

const tailwindcssModule: unknown = require('@tailwindcss/postcss');
const tailwindcss = (typeof tailwindcssModule === 'function'
  ? tailwindcssModule
  : (tailwindcssModule as { readonly default?: unknown }).default) as postcss.PluginCreator<TailwindPostcssOptions>;

const projectRoot = process.cwd();

const nanoidCheck = spawnSync('bash', [join(projectRoot, 'scripts/ensure-nanoid.sh'), 'check']);
if (nanoidCheck.status !== 0) {
  process.exit(nanoidCheck.status ?? 1);
}

const cssInput = join(projectRoot, 'src/client/styles/index.css');
const cssOutput = join(projectRoot, 'src/client/styles/index.processed.css');
const publicDir = join(projectRoot, 'public');
const sourceFontsDir = join(projectRoot, 'src/client/styles/fonts');
const publicFontsDir = join(publicDir, 'fonts');
const tempDir = join(projectRoot, '.temp');
// Ensure temp directory exists
if (!existsSync(tempDir)) {
  mkdirSync(tempDir, { recursive: true });
}
// Ensure public directory exists
if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true });
}
syncEmojiSpritesheetToPublic();
if (!existsSync(publicFontsDir)) {
  mkdirSync(publicFontsDir, { recursive: true });
}

// Step 1: Process CSS through PostCSS with Tailwind v4
console.log('🎨 Processing CSS through PostCSS/Tailwind v4...');
try {
  const css = readFileSync(cssInput, 'utf-8');
  // Import tailwind config
  const tailwindConfig = await import(join(projectRoot, 'tailwind.config.js'));
  const result = await postcss([
    tailwindcss(tailwindConfig.default || {}),
    autoprefixer,
  ]).process(css, {
    from: cssInput,
    to: cssOutput,
  });
  writeFileSync(cssOutput, result.css);
  console.log('✅ CSS processed successfully');
} catch (error) {
  console.error('❌ CSS processing failed:', error);
  process.exit(1);
}

// Step 2: Temporarily update the CSS import in the original file
const clientIndex = join(projectRoot, 'src/client/index.tsx');
const indexContent = readFileSync(clientIndex, 'utf-8');
const originalContent = indexContent;
const updatedContent = indexContent.replace(
  "import './styles/index.css';",
  "import './styles/index.processed.css';"
);
writeFileSync(clientIndex, updatedContent);

// Step 3: Copy processed CSS to public directory (Bun will bundle JS separately)
console.log('📋 Copying processed CSS to public directory...');
const publicCssPath = join(publicDir, 'index.css');
writeFileSync(publicCssPath, readFileSync(cssOutput, 'utf-8'));

// Step 3.1: Copy local font assets referenced by @font-face
const poppinsFontFiles = [
  'poppins-100-latin.woff2',
  'poppins-200-latin.woff2',
  'poppins-300-latin.woff2',
  'poppins-400-latin.woff2',
  'poppins-500-latin.woff2',
  'poppins-600-latin.woff2',
  'poppins-700-latin.woff2',
] as const;
for (const fileName of poppinsFontFiles) {
  copyFileSync(
    join(sourceFontsDir, fileName),
    join(publicFontsDir, fileName),
  );
}

// Step 4: Build JS bundle (CSS is already in public, so we don't need to import it)
console.log('📦 Building client JS bundle...');
const buildProcess = spawn([
  'bun',
  'build',
  clientIndex,
  '--outdir',
  'public',
  '--target',
  'browser',
  '--define',
  'process.env.NODE_ENV=\\"production\\"',
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
], {
  cwd: projectRoot,
  stdout: 'inherit',
  stderr: 'inherit',
});

// Step 5: Restore original file
writeFileSync(clientIndex, originalContent);

await buildProcess.exited;
if (buildProcess.exitCode !== 0) {
  console.error('❌ Build failed');
  process.exit(1);
}

console.log('✅ Client built successfully with processed CSS');
