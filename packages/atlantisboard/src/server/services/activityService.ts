import { Activity } from '../models/Activity.js';
import { logger } from '../utils/logger.js';

export interface CreateActivityInput {
  boardId: string;
  cardId?: string | undefined;
  userId: string;
  type: string;
  description: string;
  metadata?: Record<string, unknown> | undefined;
}

/** Caps stored description length (search + list payloads) without dropping the write. */
export const ACTIVITY_DESCRIPTION_MAX_LENGTH = 160;

export function shortActivityDescription(text: string): string {
  const t = text.trim();
  if (t.length <= ACTIVITY_DESCRIPTION_MAX_LENGTH) {
    return t;
  }
  return `${t.slice(0, ACTIVITY_DESCRIPTION_MAX_LENGTH - 1)}…`;
}

/**
 * Persists an activity on the next event-loop turn so request handlers are not blocked
 * by MongoDB round-trips. Failures are logged only (same reliability contract as before).
 */
export function createActivity(input: CreateActivityInput): void {
  const description = shortActivityDescription(input.description);
  const metadata =
    input.metadata !== undefined && Object.keys(input.metadata).length > 0
      ? { ...input.metadata }
      : {};

  const doc: {
    boardId: string;
    userId: string;
    type: string;
    description: string;
    metadata: Record<string, unknown>;
    cardId?: string;
  } = {
    boardId: input.boardId,
    userId: input.userId,
    type: input.type,
    description,
    metadata,
  };
  if (input.cardId !== undefined) {
    doc.cardId = input.cardId;
  }

  setImmediate(() => {
    void Activity.create(doc).catch((error: unknown) => {
      logger.error(
        { error, activityType: input.type, boardId: input.boardId },
        'Deferred activity create failed',
      );
    });
  });
}

export async function getBoardActivities(
  boardId: string,
  limit: number = 50,
  skip: number = 0
): Promise<unknown[]> {
  return await Activity.find({ boardId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('userId', 'username displayName profilePicture');
}

export async function getCardActivities(
  cardId: string,
  limit: number = 50,
  skip: number = 0
): Promise<unknown[]> {
  return await Activity.find({ cardId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('userId', 'username displayName profilePicture');
}

export async function getUserActivityFeed(
  userId: string,
  limit: number = 50,
  skip: number = 0
): Promise<unknown[]> {
  return await Activity.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('boardId', 'name')
    .populate('cardId', 'title');
}
