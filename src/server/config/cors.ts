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

const configuredOrigins = splitEnvOrigins(process.env.CORS_ORIGIN);
const allowAllOrigins = configuredOrigins.includes('*');
const configuredOriginSet = new Set(configuredOrigins.filter((origin) => origin !== '*'));
const isProduction = process.env.NODE_ENV === 'production';

export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  // Non-browser clients and same-origin server probes may omit Origin.
  if (origin == null || origin.trim() === '') {
    return true;
  }
  if (allowAllOrigins) {
    return true;
  }
  if (configuredOriginSet.has(origin)) {
    return true;
  }
  if (!isProduction && (DEV_LOCALHOST_ORIGIN_RE.test(origin) || DEV_LAN_ORIGIN_RE.test(origin))) {
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

