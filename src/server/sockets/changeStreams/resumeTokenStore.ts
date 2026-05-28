import { EJSON } from 'bson';
import type { ResumeToken } from 'mongodb';
import { redis } from '../../config/redis.js';
import { logger } from '../../utils/logger.js';

const KEY_PREFIX = 'changestream:resume:';

function resumeKey(streamId: string): string {
  return `${KEY_PREFIX}${streamId}`;
}

export function serializeResumeToken(token: ResumeToken): string {
  return EJSON.stringify(token);
}

export function deserializeResumeToken(serialized: string): ResumeToken | null {
  try {
    const parsed: unknown = EJSON.parse(serialized);
    if (parsed === null || typeof parsed !== 'object') {
      return null;
    }
    return parsed as ResumeToken;
  } catch {
    return null;
  }
}

/**
 * Loads the last persisted resume token for a collection stream.
 * Returns null when Redis is unavailable or no token was stored yet.
 */
export async function loadResumeToken(streamId: string): Promise<ResumeToken | null> {
  try {
    const raw = await redis.get(resumeKey(streamId));
    if (raw === null || raw === '') {
      return null;
    }
    return deserializeResumeToken(raw);
  } catch (error) {
    logger.warn({ error, streamId }, 'Failed to load change stream resume token from Redis');
    return null;
  }
}

/**
 * Persists the resume token after a change event is processed.
 * Fire-and-forget safe: logs warnings but does not throw.
 */
export async function saveResumeToken(streamId: string, token: ResumeToken | undefined): Promise<void> {
  if (token === undefined) {
    return;
  }
  try {
    await redis.set(resumeKey(streamId), serializeResumeToken(token));
  } catch (error) {
    logger.warn({ error, streamId }, 'Failed to save change stream resume token to Redis');
  }
}

export function persistResumeTokenAsync(streamId: string, token: ResumeToken | undefined): void {
  void saveResumeToken(streamId, token);
}

export async function deleteResumeToken(streamId: string): Promise<void> {
  try {
    await redis.del(resumeKey(streamId));
  } catch (error) {
    logger.warn({ error, streamId }, 'Failed to delete change stream resume token from Redis');
  }
}

export function deleteResumeTokenAsync(streamId: string): void {
  void deleteResumeToken(streamId);
}
