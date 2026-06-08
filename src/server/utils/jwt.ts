import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { logger } from './logger.js';
import { isJwtJtiBlocklisted, getUserTokenRevokedAt } from './jwtBlocklist.js';
import {
  DEFAULT_JWT_EXPIRES_IN,
  getJwtExpiresInFromEnv,
  parseJwtExpiryToSeconds,
} from './jwtExpiry.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

function getJwtSecret(): string {
  return process.env.JWT_SECRET || JWT_SECRET;
}

if (JWT_SECRET === 'change-this-secret-in-production') {
  logger.warn('Using default JWT secret. Change JWT_SECRET in production!');
}

export interface JWTPayload {
  userId: string;
  email: string;
  username: string;
  isAppAdmin?: boolean;
  jti: string;
}

export function generateToken(payload: Omit<JWTPayload, 'jti'>): string {
  const jti = crypto.randomUUID();
  return jwt.sign({ ...payload, jti }, getJwtSecret(), {
    expiresIn: getJwtExpiresInFromEnv(),
    issuer: 'kanboard',
    audience: 'kanboard-users',
    algorithm: 'HS256',
  } as SignOptions);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      issuer: 'kanboard',
      audience: 'kanboard-users',
      algorithms: ['HS256'],
    }) as JWTPayload & { iat?: number };

    if (typeof decoded.jti !== 'string' || decoded.jti.trim() === '') {
      logger.warn('JWT missing jti claim');
      return null;
    }

    if (await isJwtJtiBlocklisted(decoded.jti)) {
      logger.warn({ jti: decoded.jti }, 'JWT jti is blocklisted');
      return null;
    }

    const revokedAt = await getUserTokenRevokedAt(decoded.userId);
    if (
      revokedAt != null &&
      typeof decoded.iat === 'number' &&
      decoded.iat <= revokedAt
    ) {
      logger.warn({ userId: decoded.userId, jti: decoded.jti }, 'JWT issued before user revocation');
      return null;
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn({ error }, 'Invalid JWT token');
    } else if (error instanceof jwt.TokenExpiredError) {
      logger.warn({ error }, 'JWT token expired');
    } else {
      logger.error({ error }, 'Error verifying JWT token');
    }
    return null;
  }
}

export function jwtExpiresInSeconds(): number {
  return parseJwtExpiryToSeconds(getJwtExpiresInFromEnv());
}

export { DEFAULT_JWT_EXPIRES_IN, getJwtExpiresInFromEnv };
