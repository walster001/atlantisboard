import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

// Get Bun's CSRF API at runtime
const BunWithCSRF =
  typeof Bun !== 'undefined'
    ? (Bun as unknown as {
        CSRF?: {
          generate: (secret: string, options: { encoding: string; expiresIn: number }) => string;
          verify: (
            token: string,
            options: { secret: string; encoding: string; maxAge: number },
          ) => boolean;
        };
      })
    : null;
const CSRF = BunWithCSRF?.CSRF;

if (!CSRF) {
  throw new Error('Bun.CSRF is not available. Make sure you are running with Bun runtime.');
}

const csrfSecretEnv = process.env.CSRF_SECRET?.trim() ?? '';
if (csrfSecretEnv === '' || csrfSecretEnv === 'change-this-csrf-secret-in-production') {
  if (process.env.NODE_ENV === 'production') {
    logger.warn('CSRF_SECRET is missing or uses a placeholder. Set CSRF_SECRET in production!');
  }
}

const CSRF_CONFIG = {
  encoding: 'base64url' as const,
  expiresIn: 60 * 60 * 1000, // 1 hour
  maxAge: 60 * 60 * 1000, // 1 hour
};

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
const CSRF_COOKIE_NAME = 'csrf-token';

function getSessionCsrfSecret(req: Request): string | undefined {
  if (!req.session) {
    return undefined;
  }
  if (req.session.csrfSecret == null || req.session.csrfSecret === '') {
    req.session.csrfSecret = crypto.randomBytes(32).toString('base64url');
  }
  return req.session.csrfSecret;
}

function generateTokenForSecret(secret: string): string {
  if (!CSRF) {
    throw new Error('Bun.CSRF is not available');
  }
  return CSRF.generate(secret, CSRF_CONFIG);
}

function verifyTokenForSecret(token: string, secret: string): boolean {
  if (!CSRF || !token || typeof token !== 'string') {
    return false;
  }
  try {
    return CSRF.verify(token, {
      secret,
      encoding: CSRF_CONFIG.encoding,
      maxAge: CSRF_CONFIG.maxAge,
    });
  } catch (error) {
    logger.error({ error }, 'Error verifying CSRF token');
    return false;
  }
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function setCSRFCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: CSRF_CONFIG.expiresIn,
  });
}

/**
 * Issue a session-bound CSRF token (cookie + response header).
 * Call from GET /csrf/token and after login/session regeneration only.
 */
export function issueCSRFToken(req: Request, res: Response): string {
  const secret = getSessionCsrfSecret(req);
  if (!secret) {
    throw new Error('Session required to issue CSRF token');
  }

  const token = generateTokenForSecret(secret);
  setCSRFCookie(res, token);
  res.setHeader('X-CSRF-Token', token);
  (req as Request & { csrfToken?: string }).csrfToken = token;
  return token;
}

/**
 * Middleware for routes that explicitly refresh CSRF (e.g. GET /csrf/token).
 */
export function attachCSRFToken(req: Request, res: Response, next: NextFunction): void {
  try {
    issueCSRFToken(req, res);
    next();
  } catch (error) {
    logger.error({ error }, 'Error issuing CSRF token');
    next(error);
  }
}

function readSubmittedCsrfToken(req: Request): string | undefined {
  const header = req.headers['x-csrf-token'];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  const bodyToken = req.body?.csrfToken;
  if (typeof bodyToken === 'string' && bodyToken.length > 0) {
    return bodyToken;
  }
  return undefined;
}

/**
 * CSRF protection: double-submit cookie + session-bound Bun.CSRF verification.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }

  const submittedToken = readSubmittedCsrfToken(req);
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;

  if (!submittedToken || !cookieToken) {
    logger.warn(
      { method: req.method, path: req.path, ip: req.ip },
      'CSRF token missing (header/cookie)',
    );
    res.status(403).json({
      error: {
        message: 'CSRF token missing',
        code: 'CSRF_TOKEN_MISSING',
        statusCode: 403,
      },
    });
    return;
  }

  if (!timingSafeEqualStrings(submittedToken, cookieToken)) {
    logger.warn(
      { method: req.method, path: req.path, ip: req.ip },
      'CSRF double-submit mismatch',
    );
    res.status(403).json({
      error: {
        message: 'Invalid CSRF token',
        code: 'CSRF_TOKEN_INVALID',
        statusCode: 403,
      },
    });
    return;
  }

  const sessionSecret = req.session?.csrfSecret;
  if (!sessionSecret || !verifyTokenForSecret(submittedToken, sessionSecret)) {
    logger.warn(
      { method: req.method, path: req.path, ip: req.ip },
      'Invalid CSRF token (session-bound verification failed)',
    );
    res.status(403).json({
      error: {
        message: 'Invalid CSRF token',
        code: 'CSRF_TOKEN_INVALID',
        statusCode: 403,
      },
    });
    return;
  }

  next();
}
