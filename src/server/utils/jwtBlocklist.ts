import { redis } from '../config/redis.js';
import { logger } from './logger.js';

const BLOCKLIST_PREFIX = 'jwt:blocklist:';

function blocklistKey(jti: string): string {
  return `${BLOCKLIST_PREFIX}${jti}`;
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

export async function isJwtJtiBlocklisted(jti: string): Promise<boolean> {
  try {
    const hit = await redis.get(blocklistKey(jti));
    return hit === '1';
  } catch (error) {
    logger.error({ error, jti }, 'Failed to check JWT blocklist');
    return process.env.NODE_ENV === 'production';
  }
}
