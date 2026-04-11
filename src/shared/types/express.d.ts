/**
 * Express Request/Response type extensions
 *
 * Passport augments Express.Request with `user?: Express.User | undefined`.
 * We define Express.User so route handlers align with JWT `requireAuth` payload.
 */

import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    /** Set by `requireAuth` middleware (JWT), compatible with Passport `req.user`. */
    interface User {
      id: string;
      email: string;
      username: string;
      isAppAdmin?: boolean;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: Express.User;
}

export interface OptionalAuthRequest extends Request {
  user?: Express.User;
}

export type AuthHandler = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => Promise<void> | void;

export type OptionalAuthHandler = (
  req: OptionalAuthRequest,
  res: Response,
  next: NextFunction
) => Promise<void> | void;
