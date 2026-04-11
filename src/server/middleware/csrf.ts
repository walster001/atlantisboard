import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

// Get Bun's CSRF API at runtime
// Bun.CSRF is available at runtime but TypeScript definitions may not include it
const BunWithCSRF = typeof Bun !== 'undefined' ? (Bun as unknown as { CSRF?: { generate: (secret: string, options: { encoding: string; expiresIn: number }) => string; verify: (token: string, options: { secret: string; encoding: string; maxAge: number }) => boolean } }) : null;
const CSRF = BunWithCSRF?.CSRF;

if (!CSRF) {
  throw new Error('Bun.CSRF is not available. Make sure you are running with Bun runtime.');
}

// CSRF secret from environment variable (should be set in production)
const CSRF_SECRET = process.env.CSRF_SECRET || 'change-this-csrf-secret-in-production';

if (CSRF_SECRET === 'change-this-csrf-secret-in-production') {
  logger.warn('Using default CSRF secret. Change CSRF_SECRET in production!');
}

// CSRF token configuration
const CSRF_CONFIG = {
  encoding: 'base64url' as const,
  expiresIn: 60 * 60 * 1000, // 1 hour
  maxAge: 60 * 60 * 1000, // 1 hour
};

// Safe methods that don't require CSRF protection
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Generate a CSRF token using Bun's CSRF API
 */
export function generateCSRFToken(): string {
  try {
    if (!CSRF) {
      throw new Error('Bun.CSRF is not available');
    }
    // Use Bun's built-in CSRF.generate() function
    return CSRF.generate(CSRF_SECRET, CSRF_CONFIG);
  } catch (error) {
    logger.error({ error }, 'Error generating CSRF token');
    throw new Error('Failed to generate CSRF token');
  }
}

/**
 * Verify a CSRF token using Bun's CSRF API
 */
export function verifyCSRFToken(token: string): boolean {
  try {
    if (!CSRF) {
      logger.error('Bun.CSRF is not available for verification');
      return false;
    }
    
    if (!token || typeof token !== 'string') {
      return false;
    }

    // Use Bun's built-in CSRF.verify() function
    return CSRF.verify(token, {
      secret: CSRF_SECRET,
      encoding: CSRF_CONFIG.encoding,
      maxAge: CSRF_CONFIG.maxAge,
    });
  } catch (error) {
    logger.error({ error }, 'Error verifying CSRF token');
    return false;
  }
}

/**
 * CSRF protection middleware
 * Verifies CSRF tokens on state-changing requests (POST, PUT, PATCH, DELETE)
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip CSRF check for safe methods
  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }

  // Skip CSRF check for API endpoints that use token-based auth (JWT)
  // CSRF is primarily needed for session-based authentication
  // Since we use JWT tokens with SameSite=strict cookies, CSRF risk is lower
  // However, we still implement it for defense in depth

  // Get CSRF token from header or body
  const csrfToken = req.headers['x-csrf-token'] as string | undefined || 
                    (req.body && req.body.csrfToken as string | undefined);

  if (!csrfToken) {
    logger.warn(
      {
        method: req.method,
        path: req.path,
        ip: req.ip,
      },
      'CSRF token missing'
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

  // Verify CSRF token
  if (!verifyCSRFToken(csrfToken)) {
    logger.warn(
      {
        method: req.method,
        path: req.path,
        ip: req.ip,
      },
      'Invalid CSRF token'
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

/**
 * Middleware to attach CSRF token to response
 * Sets a cookie with the CSRF token and makes it available in response
 */
export function attachCSRFToken(req: Request, res: Response, next: NextFunction): void {
  // Generate CSRF token
  const token = generateCSRFToken();

  // Set CSRF token in cookie (for SameSite protection)
  res.cookie('csrf-token', token, {
    httpOnly: false, // Must be readable by JavaScript for SPAs
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: CSRF_CONFIG.expiresIn,
  });

  // Also include in response header for easy access
  res.setHeader('X-CSRF-Token', token);

  // Attach to request for potential use in routes
  (req as Request & { csrfToken?: string }).csrfToken = token;

  next();
}

