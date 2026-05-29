import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

const LOCATION_CACHE_PREFIX = 'attach:loc:';

export function attachmentLocationCacheKey(attachmentId: string): string {
  return `${LOCATION_CACHE_PREFIX}${attachmentId}`;
}

export async function invalidateAttachmentLocationCache(attachmentId: string): Promise<void> {
  try {
    await redis.del(attachmentLocationCacheKey(attachmentId));
  } catch (error) {
    logger.warn({ error, attachmentId }, 'Failed to invalidate attachment location cache');
  }
}
