import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';
import type { AuthenticatedRequest, OptionalAuthRequest } from '../../shared/types/express.js';

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

    const payload = verifyToken(token);

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

    // Verify user still exists
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

    // Check if account is locked
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

    const payload = verifyToken(token);

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
    // For optional auth, continue even if there's an error
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
    
    if (!authReq.user || !authReq.user.id) {
      res.status(401).json({
        error: {
          message: 'Authentication required',
          code: 'UNAUTHORIZED',
          statusCode: 401,
        },
      });
      return;
    }

    // Check isAppAdmin from JWT payload first (performance optimization)
    // If not available, fall back to database query
    let isAppAdmin = authReq.user.isAppAdmin;
    
    if (isAppAdmin === undefined) {
      // Fallback to database query if not in JWT
      const user = await User.findById(authReq.user.id).select('isAppAdmin');
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
      isAppAdmin = user.isAppAdmin || false;
    }

    if (!isAppAdmin) {
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

function extractToken(req: Request): string | null {
  const isLikelyJwt = (value: string): boolean => {
    const token = value.trim();
    return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
  };

  // Check Authorization header
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7).trim();
    if (isLikelyJwt(bearerToken)) {
      return bearerToken;
    }
  }

  // Check cookie - need cookie-parser middleware for this
  const cookies = (req as { cookies?: Record<string, string> }).cookies;
  if (typeof cookies?.token === 'string' && isLikelyJwt(cookies.token)) {
    return cookies.token.trim();
  }

  // Fallback for image/file URLs that pass token via query string.
  const query = req.query as Record<string, unknown>;
  const queryToken = query.token;
  if (typeof queryToken === 'string' && isLikelyJwt(queryToken)) {
    return queryToken.trim();
  }

  return null;
}

