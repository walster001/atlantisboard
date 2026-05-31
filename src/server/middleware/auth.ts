import type { Request, Response, NextFunction } from 'express';
import { verifyToken, jwtExpiresInSeconds } from '../utils/jwt.js';
import { blocklistJwtJti } from '../utils/jwtBlocklist.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { AUTH_COOKIE_NAME, isProductionAuthMode } from '../utils/authCookie.js';
import { verifySignedAssetUrl } from '../utils/signedAssetUrl.js';
import type { AuthenticatedRequest, OptionalAuthRequest } from '../types/express.js';

function isLikelyJwt(value: string): boolean {
  const token = value.trim();
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({
        error: {
          message: 'Authentication required',
          code: 'UNAUTHORIZED',
          statusCode: 401,
        },
      });
      return;
    }

    const payload = await verifyToken(token);

    if (!payload) {
      res.status(401).json({
        error: {
          message: 'Invalid or expired token',
          code: 'INVALID_TOKEN',
          statusCode: 401,
        },
      });
      return;
    }

    const user = await User.findById(payload.userId).select('+failedLoginAttempts +lockedUntil isAppAdmin');
    if (!user) {
      res.status(401).json({
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND',
          statusCode: 401,
        },
      });
      return;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      res.status(403).json({
        error: {
          message: 'Account is locked',
          code: 'ACCOUNT_LOCKED',
          statusCode: 403,
        },
      });
      return;
    }

    const authReq = req as AuthenticatedRequest;
    authReq.user = {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      isAppAdmin: user.isAppAdmin || false,
    };

    next();
  } catch (error) {
    logger.error({ error }, 'Error in requireAuth middleware');
    res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR',
        statusCode: 500,
      },
    });
  }
}

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);

    if (!token) {
      next();
      return;
    }

    const payload = await verifyToken(token);

    if (!payload) {
      next();
      return;
    }

    const user = await User.findById(payload.userId);
    if (!user || (user.lockedUntil && user.lockedUntil > new Date())) {
      next();
      return;
    }

    const authReq = req as OptionalAuthRequest;
    authReq.user = {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      isAppAdmin: user.isAppAdmin || false,
    };

    next();
  } catch (error) {
    logger.warn({ error }, 'Error in optionalAuth middleware, continuing without auth');
    next();
  }
}

export async function requireAppAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user?.id) {
      res.status(401).json({
        error: {
          message: 'Authentication required',
          code: 'UNAUTHORIZED',
          statusCode: 401,
        },
      });
      return;
    }

    if (!authReq.user.isAppAdmin) {
      logger.warn(
        { userId: authReq.user.id, ip: req.ip },
        'Non-admin user attempted to access admin route'
      );
      res.status(403).json({
        error: {
          message: 'App admin access required',
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }

    next();
  } catch (error) {
    logger.error({ error }, 'Error in requireAppAdmin middleware');
    res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR',
        statusCode: 500,
      },
    });
  }
}

export async function blocklistTokenFromRequest(req: Request): Promise<void> {
  const token = extractToken(req);
  if (token == null) {
    return;
  }
  const payload = await verifyToken(token);
  if (payload?.jti) {
    await blocklistJwtJti(payload.jti, jwtExpiresInSeconds());
  }
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7).trim();
    if (isLikelyJwt(bearerToken)) {
      return bearerToken;
    }
  }

  const cookies = (req as { cookies?: Record<string, string> }).cookies;
  if (typeof cookies?.[AUTH_COOKIE_NAME] === 'string' && isLikelyJwt(cookies[AUTH_COOKIE_NAME])) {
    return cookies[AUTH_COOKIE_NAME].trim();
  }

  if (!isProductionAuthMode()) {
    const query = req.query as Record<string, unknown>;
    const queryToken = query.token;
    if (typeof queryToken === 'string' && isLikelyJwt(queryToken)) {
      return queryToken.trim();
    }
  }

  return null;
}

export function extractTokenFromHandshake(
  authToken: unknown,
  authorizationHeader: unknown,
  cookieHeader: unknown,
): string | null {
  if (typeof authToken === 'string' && isLikelyJwt(authToken)) {
    return authToken.trim();
  }

  if (typeof authorizationHeader === 'string' && authorizationHeader.startsWith('Bearer ')) {
    const bearer = authorizationHeader.substring(7).trim();
    if (isLikelyJwt(bearer)) {
      return bearer;
    }
  }

  if (typeof cookieHeader === 'string' && cookieHeader.length > 0) {
    for (const part of cookieHeader.split(';')) {
      const trimmed = part.trim();
      if (trimmed.startsWith(`${AUTH_COOKIE_NAME}=`)) {
        const value = trimmed.slice(AUTH_COOKIE_NAME.length + 1).trim();
        if (isLikelyJwt(value)) {
          return value;
        }
      }
    }
  }

  return null;
}

export function hasValidSignedAssetQuery(req: Request, assetPath: string): boolean {
  const exp = typeof req.query.exp === 'string' ? req.query.exp : undefined;
  const sig = typeof req.query.sig === 'string' ? req.query.sig : undefined;
  return verifySignedAssetUrl(assetPath, exp, sig);
}

export async function requireSignedAssetOrAuth(
  req: Request,
  res: Response,
  assetPath: string,
): Promise<boolean> {
  if (hasValidSignedAssetQuery(req, assetPath)) {
    return true;
  }
  const token = extractToken(req);
  if (token == null) {
    res.status(401).json({
      error: {
        message: 'Authentication or signed URL required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      },
    });
    return false;
  }
  const payload = await verifyToken(token);
  if (payload == null) {
    res.status(401).json({
      error: {
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
        statusCode: 401,
      },
    });
    return false;
  }

  const user = await User.findById(payload.userId).select('+failedLoginAttempts +lockedUntil isAppAdmin');
  if (!user) {
    res.status(401).json({
      error: {
        message: 'User not found',
        code: 'USER_NOT_FOUND',
        statusCode: 401,
      },
    });
    return false;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    res.status(403).json({
      error: {
        message: 'Account is locked',
        code: 'ACCOUNT_LOCKED',
        statusCode: 403,
      },
    });
    return false;
  }

  return true;
}
