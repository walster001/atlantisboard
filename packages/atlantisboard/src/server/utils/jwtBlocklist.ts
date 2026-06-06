import { redis } from '../config/redis.js';
import { logger } from './logger.js';

const BLOCKLIST_PREFIX = 'jwt:blocklist:';
const USER_REVOKED_PREFIX = 'jwt:user-revoked-at:';

function blocklistKey(jti: string): string {
  return `${BLOCKLIST_PREFIX}${jti}`;
}

function userRevokedKey(userId: string): string {
  return `${USER_REVOKED_PREFIX}${userId}`;
}

/** TTL should cover remaining token lifetime; default 24h cap. */
export async function blocklistJwtJti(jti: string, ttlSeconds: number): Promise<void> {
  const ttl = Math.max(1, Math.min(ttlSeconds, 86_400));
  try {
    await redis.set(blocklistKey(jti), '1', 'EX', ttl);
  } catch (error) {
    logger.error({ error, jti }, 'Failed to blocklist JWT jti');
    throw error;
  }
}

/**
 * Invalidate all tokens issued before this moment for the user (e.g. admin demotion).
 * Checked via JWT `iat` during verify.
 */
export async function revokeAllTokensForUser(userId: string, ttlSeconds: number): Promise<void> {
  const ttl = Math.max(1, Math.min(ttlSeconds, 86_400));
  const revokedAt = Math.floor(Date.now() / 1000);
  try {
    await redis.set(userRevokedKey(userId), String(revokedAt), 'EX', ttl);
  } catch (error) {
    logger.error({ error, userId }, 'Failed to revoke user tokens');
    throw error;
  }
}

export async function getUserTokenRevokedAt(userId: string): Promise<number | null> {
  try {
    const raw = await redis.get(userRevokedKey(userId));
    if (raw == null || raw === '') {
      return null;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to read user token revocation');
    return process.env.NODE_ENV === 'production' ? Math.floor(Date.now() / 1000) : null;
  }
}

export async function isJwtJtiBlocklisted(jti: string): Promise<boolean> {
  try {
    const hit = await redis.get(blocklistKey(jti));
    return hit === '1';
  } catch (error) {
    logger.error({ error, jti }, 'Failed to check JWT blocklist');
    return process.env.NODE_ENV === 'production';
  }
}
