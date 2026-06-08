import type { IBoardSettings } from '../models/Board.js';
import { Board } from '../models/Board.js';
import {
  type BoardActivityTrackingCategory,
  type BoardContentActivityType,
  boardActivityTrackingEnabled,
  isBoardContentActivityType,
} from '../../shared/constants/boardContentActivities.js';
import { createActivity } from './activityService.js';

export interface RecordBoardActivityInput {
  boardId: string;
  userId: string;
  category: BoardActivityTrackingCategory;
  type: BoardContentActivityType;
  description: string;
  cardId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  /** When the caller already loaded board settings, pass them to skip an extra read. */
  boardSettings?: Pick<
    IBoardSettings,
    'activityLogEnabled' | 'activityLogTracking'
  > | undefined;
}

type ActivityLogBoardSettings = Pick<IBoardSettings, 'activityLogEnabled' | 'activityLogTracking'>;

async function loadActivityLogBoardSettings(boardId: string): Promise<ActivityLogBoardSettings | null> {
  const board = await Board.findById(boardId)
    .select('settings.activityLogEnabled settings.activityLogTracking')
    .lean();
  if (board == null) {
    return null;
  }
  const result: ActivityLogBoardSettings = {};
  if (board.settings?.activityLogEnabled !== undefined) {
    result.activityLogEnabled = board.settings.activityLogEnabled;
  }
  if (board.settings?.activityLogTracking !== undefined) {
    result.activityLogTracking = board.settings.activityLogTracking;
  }
  return result;
}

function shouldRecordBoardActivity(
  settings: ActivityLogBoardSettings,
  category: BoardActivityTrackingCategory,
  type: BoardContentActivityType,
): boolean {
  if (!isBoardContentActivityType(type)) {
    return false;
  }
  if (settings.activityLogEnabled !== true) {
    return false;
  }
  return boardActivityTrackingEnabled(settings.activityLogTracking, category);
}

/**
 * Persists a board content activity when the board has activity logging enabled
 * and the category toggle is on. No-op otherwise.
 */
export async function recordBoardActivity(input: RecordBoardActivityInput): Promise<void> {
  const settings =
    input.boardSettings ?? (await loadActivityLogBoardSettings(input.boardId));
  if (settings == null) {
    return;
  }
  if (!shouldRecordBoardActivity(settings, input.category, input.type)) {
    return;
  }

  createActivity({
    boardId: input.boardId,
    userId: input.userId,
    type: input.type,
    description: input.description,
    ...(input.cardId !== undefined ? { cardId: input.cardId } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  });
}

/** Fire-and-forget wrapper for hot paths that should not await Mongo reads. */
export function recordBoardActivityDeferred(input: RecordBoardActivityInput): void {
  void recordBoardActivity(input).catch(() => undefined);
}
