import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export function readAppVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, '../../../../package.json');
    const raw = readFileSync(pkgPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return typeof parsed.version === 'string' && parsed.version.trim() !== ''
      ? parsed.version.trim()
      : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const APP_VERSION = readAppVersion();

export function parseCsvEnv(name: string): readonly string[] | undefined {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') {
    return undefined;
  }
  const values = raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '');
  return values.length > 0 ? values : undefined;
}
