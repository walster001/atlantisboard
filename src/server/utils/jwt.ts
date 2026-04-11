import jwt, { type SignOptions } from 'jsonwebtoken';
import { logger } from './logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (JWT_SECRET === 'change-this-secret-in-production') {
  logger.warn('Using default JWT secret. Change JWT_SECRET in production!');
}

export interface JWTPayload {
  userId: string;
  email: string;
  username: string;
  isAppAdmin?: boolean;
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'kanboard',
    audience: 'kanboard-users',
  } as SignOptions);
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'kanboard',
      audience: 'kanboard-users',
    }) as JWTPayload;
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

