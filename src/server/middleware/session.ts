import session from 'express-session';
import { RedisStore } from 'connect-redis';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { sessionRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-session-secret-in-production';

if (SESSION_SECRET === 'change-this-session-secret-in-production') {
  logger.warn('Using default session secret. Change SESSION_SECRET in production!');
}

/** Must match cookie `maxAge` so Redis session keys always get a bounded TTL (connect-redis fallback). */
const SESSION_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_REDIS_TTL_SECONDS = Math.max(1, Math.ceil(SESSION_COOKIE_MAX_AGE_MS / 1000));

export const sessionMiddleware = session({
  store: new RedisStore({
    client: sessionRedisClient,
    prefix: 'session:',
    ttl: SESSION_REDIS_TTL_SECONDS,
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'sessionId',
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Lax: required so the session cookie is sent on the OAuth return navigation
    // (Google → /api/v1/auth/google/callback). Strict would omit the cookie on that
    // cross-site redirect and break Passport OAuth state / oauthReturnTo.
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  },
  genid: () => {
    // Generate unique session ID
    return crypto.randomUUID();
  },
});

// Session regeneration middleware (session fixation protection)
export function regenerateSession(
  req: Request & { session: session.Session & { regenerate: (callback: (err?: Error) => void) => void } },
  _res: Response,
  next: NextFunction
): void {
  const oldSessionId = req.sessionID;
  if (req.session?.regenerate) {
    req.session.regenerate((err?: Error) => {
      if (err) {
        logger.error({ err }, 'Error regenerating session');
        return next(err);
      }
      logger.info({ oldSessionId, newSessionId: req.sessionID }, 'Session regenerated');
      next();
    });
  } else {
    next();
  }
}

