import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function resolveEnvFilePath(): string {
  const fromEnv = process.env.ATL_ENV_FILE?.trim() ?? process.env.ENV_FILE?.trim();
  if (fromEnv != null && fromEnv !== '') {
    return resolve(fromEnv);
  }
  return resolve(process.cwd(), '.env');
}

function parseEnvLineValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function escapeRegExp(key: string): string {
  return key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keyAssignmentPattern(key: string): RegExp {
  return new RegExp(`^${escapeRegExp(key)}=.*$`, 'gm');
}

/** Reads a single KEY from the deployment .env file (not process.env). First assignment wins. */
export function readEnvFileVariable(key: string): string | null {
  const envPath = resolveEnvFilePath();
  let contents = '';
  try {
    contents = readFileSync(envPath, 'utf8');
  } catch {
    return null;
  }
  const pattern = new RegExp(`^${escapeRegExp(key)}=(.*)$`, 'm');
  const match = pattern.exec(contents);
  if (match == null) {
    return null;
  }
  return parseEnvLineValue(match[1] ?? '');
}

function stripAllKeyAssignments(contents: string, key: string): string {
  const stripped = contents.replace(keyAssignmentPattern(key), '');
  return stripped.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '\n');
}

function formatEnvLine(key: string, value: string): string {
  if (/[\s#"'\\]/.test(value)) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `${key}="${escaped}"`;
  }
  return `${key}=${value}`;
}

/**
 * Upserts a single KEY=value line in the deployment .env file.
 * Returns false when the file could not be written (read-only, missing, etc.).
 */
export function upsertEnvFileVariable(key: string, value: string): boolean {
  const envPath = resolveEnvFilePath();
  let contents = '';
  try {
    contents = readFileSync(envPath, 'utf8');
  } catch {
    return false;
  }

  const line = formatEnvLine(key, value);
  const hadKey = keyAssignmentPattern(key).test(contents);
  const stripped = hadKey ? stripAllKeyAssignments(contents, key) : contents;
  const nextContents =
    stripped === '' ? `${line}\n` : `${stripped.endsWith('\n') ? stripped : `${stripped}\n`}${line}\n`;

  try {
    writeFileSync(envPath, nextContents, 'utf8');
    return true;
  } catch {
    return false;
  }
}
