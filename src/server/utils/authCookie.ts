import type { Response } from 'express';
import { authCookieMaxAgeMs } from './jwtExpiry.js';

export const AUTH_COOKIE_NAME = 'token';

export function isProductionAuthMode(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProductionAuthMode(),
    sameSite: 'strict',
    path: '/',
    maxAge: authCookieMaxAgeMs(),
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
