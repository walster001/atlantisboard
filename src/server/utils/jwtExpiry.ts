/** Default session JWT lifetime when `JWT_EXPIRES_IN` is unset. */
export const DEFAULT_JWT_EXPIRES_IN = '1d';

/**
 * Reads `JWT_EXPIRES_IN` for jsonwebtoken `expiresIn` (e.g. `1d`, `10m`, `3600`).
 * Bare integers are seconds, matching jsonwebtoken / ms parsing.
 */
export function getJwtExpiresInFromEnv(): string {
  const raw = process.env.JWT_EXPIRES_IN?.trim();
  return raw !== undefined && raw !== '' ? raw : DEFAULT_JWT_EXPIRES_IN;
}

/**
 * Converts a JWT expiry string to milliseconds for HttpOnly cookie `maxAge`.
 * Supports `10m`, `1h`, `1d`, and bare seconds (`600` → 10 minutes).
 */
export function parseJwtExpiryToMs(raw: string): number {
  const trimmed = raw.trim();
  const unitMatch = /^(\d+)([smhd])$/i.exec(trimmed);
  if (unitMatch) {
    const amount = Number.parseInt(unitMatch[1] ?? '1', 10);
    const unit = (unitMatch[2] ?? 'h').toLowerCase();
    switch (unit) {
      case 's':
        return amount * 1000;
      case 'm':
        return amount * 60 * 1000;
      case 'h':
        return amount * 60 * 60 * 1000;
      case 'd':
        return amount * 24 * 60 * 60 * 1000;
      default:
        break;
    }
  }

  const bareSeconds = /^\d+$/.exec(trimmed);
  if (bareSeconds) {
    const seconds = Number.parseInt(trimmed, 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }

  return parseJwtExpiryToMs(DEFAULT_JWT_EXPIRES_IN);
}

/** Seconds equivalent of `parseJwtExpiryToMs` (JWT blocklist TTL, revocation windows). */
export function parseJwtExpiryToSeconds(raw: string): number {
  return Math.max(1, Math.ceil(parseJwtExpiryToMs(raw) / 1000));
}

export function authCookieMaxAgeMs(): number {
  return parseJwtExpiryToMs(getJwtExpiresInFromEnv());
}
