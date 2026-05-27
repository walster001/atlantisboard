/**
 * Browser-safe environment configuration
 * Replaces process.env usage in client code
 */

// Define process if it doesn't exist (for browser compatibility)
if (typeof process === 'undefined') {
  // @ts-expect-error - Defining process for browser
  globalThis.process = {
    env: {
      NODE_ENV: 'development',
      API_BASE_URL: '',
      SOCKET_URL: '',
      REALTIME_BULK_CARD_PATCH_ENABLED: '1',
      REALTIME_DELTA_MODE: '1',
      ASSIGNEE_DIRECTORY_LAZY_ENABLED: '1',
      ASSIGNEE_DIRECTORY_PAGE_SIZE: '64',
      BOARD_SCALE_FIXTURE_MODE: '',
      BOARD_PERF_INSTRUMENTATION_ENABLED: '',
    },
  };
}

function readEnvString(key: string, fallback = ''): string {
  const raw =
    typeof process !== 'undefined' && process.env != null
      ? (process.env as Record<string, string | undefined>)[key]
      : undefined;
  return raw ?? fallback;
}

function readEnvBoolean(key: string, fallback: boolean): boolean {
  const raw = readEnvString(key, fallback ? '1' : '0').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') {
    return true;
  }
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') {
    return false;
  }
  return fallback;
}

function readEnvNumber(key: string, fallback: number): number {
  const n = Number(readEnvString(key, String(fallback)).trim());
  return Number.isFinite(n) ? n : fallback;
}

/** HttpOnly cookie auth in production; dev may use localStorage JWT for convenience. */
export function usesHttpOnlyAuth(): boolean {
  return readEnvString('NODE_ENV', 'development') === 'production';
}

export const env = {
  NODE_ENV: readEnvString('NODE_ENV', 'development'),
  API_BASE_URL: readEnvString('API_BASE_URL', ''),
  SOCKET_URL: readEnvString('SOCKET_URL', ''),
  REALTIME_BULK_CARD_PATCH_ENABLED: readEnvBoolean('REALTIME_BULK_CARD_PATCH_ENABLED', true),
  REALTIME_DELTA_MODE: readEnvBoolean('REALTIME_DELTA_MODE', true),
  ASSIGNEE_DIRECTORY_LAZY_ENABLED: readEnvBoolean('ASSIGNEE_DIRECTORY_LAZY_ENABLED', true),
  ASSIGNEE_DIRECTORY_PAGE_SIZE: Math.max(8, readEnvNumber('ASSIGNEE_DIRECTORY_PAGE_SIZE', 64)),
  BOARD_SCALE_FIXTURE_MODE: readEnvString('BOARD_SCALE_FIXTURE_MODE', ''),
  BOARD_PERF_INSTRUMENTATION_ENABLED: readEnvBoolean('BOARD_PERF_INSTRUMENTATION_ENABLED', false),
};
