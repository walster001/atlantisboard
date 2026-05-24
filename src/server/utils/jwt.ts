import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { logger } from './logger.js';
import { isJwtJtiBlocklisted } from './jwtBlocklist.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

function getJwtSecret(): string {
  return process.env.JWT_SECRET || JWT_SECRET;
}

function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || JWT_EXPIRES_IN;
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
    expiresIn: getJwtExpiresIn(),
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
    }) as JWTPayload;

    if (typeof decoded.jti !== 'string' || decoded.jti.trim() === '') {
      logger.warn('JWT missing jti claim');
      return null;
    }

    if (await isJwtJtiBlocklisted(decoded.jti)) {
      logger.warn({ jti: decoded.jti }, 'JWT jti is blocklisted');
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
  const raw = getJwtExpiresIn().trim();
  const match = /^(\d+)([smhd])$/i.exec(raw);
  if (!match) {
    return 3600;
  }
  const amount = Number.parseInt(match[1] ?? '1', 10);
  const unit = (match[2] ?? 'h').toLowerCase();
  switch (unit) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 3600;
    case 'd':
      return amount * 86_400;
    default:
      return 3600;
  }
}
