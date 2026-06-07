import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function resolveEnvFilePath(): string {
  const fromEnv = process.env.ATL_ENV_FILE?.trim() ?? process.env.ENV_FILE?.trim();
  if (fromEnv != null && fromEnv !== '') {
    return resolve(fromEnv);
  }
  return resolve(process.cwd(), '.env');
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
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const nextContents = pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents.endsWith('\n') || contents === '' ? contents : `${contents}\n`}${line}\n`;

  try {
    writeFileSync(envPath, nextContents, 'utf8');
    return true;
  } catch {
    return false;
  }
}
