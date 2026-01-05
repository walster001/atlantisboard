import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from './errorHandler.js';
import { jwtService } from '../services/jwt.service.js';
import { prisma } from '../db/client.js';

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
    isAdmin: boolean;
  };
}

export interface AuthenticatedRequest extends Request {
  userId: string;
  user: {
    id: string;
    email: string;
    isAdmin: boolean;
  };
}

export function isAuthenticatedRequest(req: AuthRequest): req is AuthenticatedRequest {
  return req.userId !== undefined && req.user !== undefined;
}

export function assertAuthenticated(req: AuthRequest): asserts req is AuthenticatedRequest {
  if (!req.userId || !req.user) {
    throw new UnauthorizedError('Authentication required');
  }
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authReq = req as AuthRequest;
  try {
    const authHeader = authReq.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    const payload = await jwtService.verifyAccessToken(token);

    if (!payload.userId) {
      throw new UnauthorizedError('Invalid token payload');
    }

    // Fetch user and profile
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { profile: true },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Type assertion: after middleware, these are guaranteed to be set
    (authReq as AuthenticatedRequest).userId = user.id;
    (authReq as AuthenticatedRequest).user = {
      id: user.id,
      email: user.email,
      isAdmin: user.profile?.isAdmin ?? false,
    };

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return next(error);
    }
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

// Optional auth - doesn't fail if no token, but sets user if present
export async function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authReq = req as AuthRequest;
  try {
    const authHeader = authReq.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const payload = await jwtService.verifyAccessToken(token);

    if (payload.userId) {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: { profile: true },
      });

      if (user) {
        authReq.userId = user.id;
        authReq.user = {
          id: user.id,
          email: user.email,
          isAdmin: user.profile?.isAdmin ?? false,
        };
      }
    }

    next();
  } catch (error) {
    // Silently fail for optional auth
    next();
  }
}

