import { z } from 'zod';
import type { Request, Response } from 'express';
import { AdminConfig } from '../../models/AdminConfig.js';
import { authTokenResponseField, setAuthCookie } from '../../utils/authCookie.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import {
  assertNewUserRegistrationAllowed,
} from '../../utils/registrationPolicy.js';
import {
  isForceHttpsEnabled,
  resolveOAuthPublicBaseUrl,
  upgradeHttpOriginToHttps,
} from '../../../shared/utils/googleOAuthCallbackUrl.js';
import { resolveHostOrigin } from '../../utils/resolveHostOrigin.js';

export async function assertEmailPasswordAllowed(res: Response): Promise<boolean> {
  const cfg = await AdminConfig.findOne();
  if (!cfg?.authMethods.emailPassword) {
    res.status(403).json({
      error: {
        message: 'Email and password sign-in is disabled for this server.',
        code: 'LOCAL_AUTH_DISABLED',
        statusCode: 403,
      },
    });
    return false;
  }
  return true;
}

export async function assertRegistrationAllowed(res: Response): Promise<boolean> {
  const registration = await assertNewUserRegistrationAllowed();
  if (registration.allowed) {
    return true;
  }
  if (registration.reason === 'REGISTRATION_DISABLED') {
    res.status(403).json({
      error: {
        message: 'Registration is disabled on this server.',
        code: 'REGISTRATION_DISABLED',
        statusCode: 403,
      },
    });
    return false;
  }
  res.status(403).json({
    error: {
      message: 'Registration is invite-only. Contact an administrator for access.',
      code: 'REGISTRATION_INVITE_ONLY',
      statusCode: 403,
    },
  });
  return false;
}

export function sendAuthSuccess(
  res: Response,
  statusCode: number,
  token: string,
  user: Record<string, unknown>,
): void {
  setAuthCookie(res, token);
  res.status(statusCode).json({
    ...authTokenResponseField(token),
    user,
  });
}

export const authRateLimiter = createRateLimiter('auth');
export const apiRateLimiter = createRateLimiter('api');

export const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(12),
  displayName: z.string().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(12),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

/**
 * Base URL for redirects back to the SPA after OAuth. Prefer env in production;
 * otherwise use the incoming request so the host matches (e.g. 127.0.0.1 vs localhost).
 */
export function oauthRedirectBase(req?: Request): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const forceHttps = isForceHttpsEnabled({
    FORCE_HTTPS: process.env.FORCE_HTTPS,
  });
  const fromEnv = resolveOAuthPublicBaseUrl({
    OAUTH_REDIRECT_BASE: process.env.OAUTH_REDIRECT_BASE,
    APP_URL: process.env.APP_URL,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
  });
  if (fromEnv) {
    let base = fromEnv;
    if (forceHttps && base.startsWith('http://')) {
      base = upgradeHttpOriginToHttps(base);
    }
    if (isProduction) {
      return base;
    }
  }
  if (!isProduction && req) {
    const fromRequest = resolveHostOrigin(req);
    if (fromRequest) {
      return fromRequest;
    }
  }
  if (req) {
    const fromRequest = resolveHostOrigin(req);
    if (fromRequest) {
      return fromRequest;
    }
  }
  return 'http://localhost:3000';
}

/** Open-redirect safe path for post-OAuth navigation (e.g. invite acceptance). */
export function isSafeOAuthNextPath(next: string): boolean {
  if (!next.startsWith('/') || next.startsWith('//')) {
    return false;
  }
  if (next.includes('..')) {
    return false;
  }
  if (next.length > 2048) {
    return false;
  }
  if (next.startsWith('/login') || next.startsWith('/register')) {
    return false;
  }
  return true;
}
