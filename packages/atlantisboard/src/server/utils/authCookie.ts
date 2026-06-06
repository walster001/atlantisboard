import type { Response } from 'express';

export const AUTH_COOKIE_NAME = 'token';

const AUTH_COOKIE_MAX_AGE_MS = parseJwtExpiryMs(process.env.JWT_EXPIRES_IN ?? '1h');

function parseJwtExpiryMs(raw: string): number {
  const trimmed = raw.trim();
  const match = /^(\d+)([smhd])$/i.exec(trimmed);
  if (!match) {
    return 60 * 60 * 1000;
  }
  const amount = Number.parseInt(match[1] ?? '1', 10);
  const unit = (match[2] ?? 'h').toLowerCase();
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
      return 60 * 60 * 1000;
  }
}

export function isProductionAuthMode(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProductionAuthMode(),
    sameSite: 'strict',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProductionAuthMode(),
    sameSite: 'strict',
    path: '/',
  });
}

/** Include JWT in JSON body only outside production (dev/localStorage flows). */
export function authTokenResponseField(token: string): { token?: string } {
  if (isProductionAuthMode()) {
    return {};
  }
  return { token };
}
