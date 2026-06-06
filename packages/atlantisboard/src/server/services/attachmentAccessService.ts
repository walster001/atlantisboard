import { redis } from '../config/redis.js';
import { attachmentLocationCacheKey } from './attachmentCache.js';
import { Card, type ICardAttachment } from '../models/Card.js';
import { hasPermission, type AuthUser } from '../utils/permissions.js';
import { logger } from '../utils/logger.js';
import { isPlaceholderCardAttachment } from '../../shared/cardAttachmentPlaceholder.js';
import {
  getAttachmentObjectMeta,
  type AttachmentObjectMeta,
} from './attachmentService.js';

const AUTH_CACHE_PREFIX = 'attach:auth:';

const LOCATION_TTL_SEC = 600;
const AUTH_TTL_SEC = 180;

export interface CachedAttachmentLocation {
  readonly boardId: string;
  readonly objectName: string;
  readonly contentType: string;
  readonly size: number;
  readonly storedUrl: string;
  readonly attachment: Pick<
    ICardAttachment,
    'id' | 'name' | 'url' | 'type' | 'size' | 'isPlaceholder'
  >;
}

export interface ResolvedAttachmentAccess {
  readonly boardId: string;
  readonly attachment: Pick<ICardAttachment, 'id' | 'name' | 'url' | 'type' | 'size'>;
  readonly objectMeta: AttachmentObjectMeta;
}

export type AttachmentAccessFailure = {
  readonly status: 404 | 403;
  readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'ATTACHMENT_PLACEHOLDER';
  readonly message: string;
};

function authCacheKey(userId: string, boardId: string): string {
  return `${AUTH_CACHE_PREFIX}${userId}:${boardId}`;
}

async function readLocationCache(
  attachmentId: string,
): Promise<CachedAttachmentLocation | null> {
  try {
    const raw = await redis.get(attachmentLocationCacheKey(attachmentId));
    if (raw == null || raw === '') {
      return null;
    }
    const parsed: unknown = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      typeof (parsed as { boardId?: unknown }).boardId !== 'string' ||
      typeof (parsed as { objectName?: unknown }).objectName !== 'string'
    ) {
      return null;
    }
    return parsed as CachedAttachmentLocation;
  } catch (error) {
    logger.warn({ error, attachmentId }, 'Failed to read attachment location cache');
    return null;
  }
}

async function writeLocationCache(
  attachmentId: string,
  value: CachedAttachmentLocation,
): Promise<void> {
  try {
    await redis.set(attachmentLocationCacheKey(attachmentId), JSON.stringify(value), 'EX', LOCATION_TTL_SEC);
  } catch (error) {
    logger.warn({ error, attachmentId }, 'Failed to write attachment location cache');
  }
}

async function readAuthCache(userId: string, boardId: string): Promise<boolean | null> {
  try {
    const raw = await redis.get(authCacheKey(userId, boardId));
    if (raw === '1') {
      return true;
    }
    if (raw === '0') {
      return false;
    }
    return null;
  } catch (error) {
    logger.warn({ error, userId, boardId }, 'Failed to read attachment auth cache');
    return null;
  }
}

async function writeAuthCache(userId: string, boardId: string, allowed: boolean): Promise<void> {
  try {
    await redis.set(authCacheKey(userId, boardId), allowed ? '1' : '0', 'EX', AUTH_TTL_SEC);
  } catch (error) {
    logger.warn({ error, userId, boardId }, 'Failed to write attachment auth cache');
  }
}

export { invalidateAttachmentLocationCache } from './attachmentCache.js';

async function loadAttachmentLocationFromDb(
  attachmentId: string,
): Promise<CachedAttachmentLocation | AttachmentAccessFailure> {
  const card = await Card.findOne({ 'attachments.id': attachmentId }).select('boardId attachments').lean();
  if (card == null) {
    return {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Attachment not found',
    };
  }

  const attachment = card.attachments?.find((att) => att.id === attachmentId);
  if (attachment == null) {
    return {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Attachment not found',
    };
  }

  if (isPlaceholderCardAttachment(attachment)) {
    return {
      status: 404,
      code: 'ATTACHMENT_PLACEHOLDER',
      message: 'No file has been uploaded for this attachment yet',
    };
  }

  const objectMeta = await getAttachmentObjectMeta(attachment.url);
  const boardId = card.boardId.toString();

  const cached: CachedAttachmentLocation = {
    boardId,
    objectName: objectMeta.objectName,
    contentType: objectMeta.contentType,
    size: objectMeta.size,
    storedUrl: attachment.url,
    attachment: {
      id: attachment.id,
      name: attachment.name,
      url: attachment.url,
      type: attachment.type,
      size: attachment.size,
      ...(attachment.isPlaceholder === true ? { isPlaceholder: true as const } : {}),
    },
  };

  await writeLocationCache(attachmentId, cached);
  return cached;
}

async function ensureBoardViewPermission(
  user: AuthUser,
  boardId: string,
): Promise<boolean> {
  const cached = await readAuthCache(user.id, boardId);
  if (cached !== null) {
    return cached;
  }
  const allowed = await hasPermission(user, boardId, 'boards.view');
  await writeAuthCache(user.id, boardId, allowed);
  return allowed;
}

/**
 * Resolves attachment metadata and verifies `boards.view` for the requesting user.
 * Uses short-lived Redis caches to avoid per-range Mongo + permission checks.
 */
export async function resolveAttachmentForUser(
  attachmentId: string,
  user: AuthUser,
): Promise<ResolvedAttachmentAccess | AttachmentAccessFailure> {
  let location = await readLocationCache(attachmentId);
  if (location == null) {
    const loaded = await loadAttachmentLocationFromDb(attachmentId);
    if ('status' in loaded) {
      return loaded;
    }
    location = loaded;
  }

  const allowed = await ensureBoardViewPermission(user, location.boardId);
  if (!allowed) {
    return {
      status: 403,
      code: 'FORBIDDEN',
      message: 'Access denied',
    };
  }

  return {
    boardId: location.boardId,
    attachment: location.attachment,
    objectMeta: {
      objectName: location.objectName,
      contentType: location.contentType,
      size: location.size,
    },
  };
}
