import type { CorsOptions } from 'cors';

const DEV_LOCALHOST_ORIGIN_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;
const DEV_LAN_ORIGIN_RE = /^https?:\/\/(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?::\d+)?$/i;

function splitEnvOrigins(value: string | undefined): string[] {
  if (value == null) {
    return [];
  }
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function readCorsOriginsFromEnv(): readonly string[] {
  return splitEnvOrigins(process.env.CORS_ORIGIN);
}

export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  const origins = readCorsOriginsFromEnv();
  const allowAll = origins.includes('*');
  const originSet = new Set(origins.filter((entry) => entry !== '*'));
  const production = process.env.NODE_ENV === 'production';

  // Non-browser clients and same-origin server probes may omit Origin.
  if (origin == null || origin.trim() === '') {
    return true;
  }
  if (allowAll) {
    return true;
  }
  if (originSet.has(origin)) {
    return true;
  }
  if (!production && (DEV_LOCALHOST_ORIGIN_RE.test(origin) || DEV_LAN_ORIGIN_RE.test(origin))) {
    return true;
  }
  return false;
}

export const expressCorsOptions: CorsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedCorsOrigin(origin));
  },
  credentials: true,
};

/**
 * Reject wildcard CORS in production so browser credentials cannot be sent
 * from arbitrary origins.
 */
export function assertProductionCorsConfig(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const origins = readCorsOriginsFromEnv();
  const allowAll = origins.includes('*');

  if (allowAll) {
    throw new Error(
      'Production startup blocked: CORS_ORIGIN must not include "*". ' +
        'Set explicit origins, e.g. CORS_ORIGIN=https://app.atlantis.social'
    );
  }

  if (origins.length === 0) {
    throw new Error(
      'Production startup blocked: CORS_ORIGIN must list at least one explicit browser origin.'
    );
  }
}

