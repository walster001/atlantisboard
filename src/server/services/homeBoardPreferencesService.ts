import type { Document } from 'mongoose';
import {
  BadRequestError,
  NotFoundError,
} from '../../shared/errors/domainErrors.js';
import { User } from '../models/User.js';
import type { IBoard } from '../models/Board.js';
import type { BoardSummaryDTO } from '../../shared/types/viewModels.js';
import { getBoardsByWorkspace } from './boardService/queries.js';
import { getUserWorkspaces } from './workspaceService.js';
import { workspaceListEntryId } from './boardService/helpers.js';

function boardListEntryId(board: (Document & IBoard) | BoardSummaryDTO): string {
  if ('id' in board && typeof board.id === 'string') {
    return board.id;
  }
  return (board as Document & IBoard)._id.toString();
}

/** Normalize Mongoose Map or plain object to a string-keyed record. */
export function homeBoardOrderMapToRecord(
  raw: Map<string, string[]> | Record<string, string[]> | undefined,
): Record<string, string[]> {
  if (raw == null) {
    return {};
  }
  if (raw instanceof Map) {
    return Object.fromEntries(raw.entries());
  }
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      out[key] = value;
    }
  }
  return out;
}

async function listVisibleBoardIdsInWorkspace(userId: string, workspaceId: string): Promise<string[]> {
  const wid = workspaceId.trim();
  const visibleWorkspaces = await getUserWorkspaces(userId, { view: 'summary' });
  if (!visibleWorkspaces.some((ws) => workspaceListEntryId(ws) === wid)) {
    return [];
  }
  const boards = await getBoardsByWorkspace(wid, userId, { view: 'summary' });
  return boards.map(boardListEntryId);
}

/**
 * Validates and stores per-user home board order for one workspace row.
 * Only boards the user can see in that workspace may appear; order must be complete.
 */
export async function sanitizeAndSaveHomeBoardOrderForWorkspace(
  userId: string,
  workspaceId: string,
  requestedOrder: readonly string[],
): Promise<string[]> {
  const visibleIds = await listVisibleBoardIdsInWorkspace(userId, workspaceId);
  const visibleSet = new Set(visibleIds);
  const normalized = requestedOrder.map((id) => id.trim()).filter((id) => id !== '');

  if (visibleSet.size !== normalized.length || !normalized.every((id) => visibleSet.has(id))) {
    throw new BadRequestError('Invalid board order for this workspace', 'INVALID_REORDER');
  }

  const user = await User.findById(userId);
  if (user == null) {
    throw new NotFoundError('User not found');
  }

  if (user.preferences.homeBoardOrderByWorkspace == null) {
    user.preferences.homeBoardOrderByWorkspace = new Map<string, string[]>();
  }
  const map = user.preferences.homeBoardOrderByWorkspace;
  if (map instanceof Map) {
    map.set(workspaceId.trim(), [...normalized]);
  } else {
    const record = homeBoardOrderMapToRecord(map);
    record[workspaceId.trim()] = [...normalized];
    user.preferences.homeBoardOrderByWorkspace = record;
  }

  user.markModified('preferences');
  await user.save();

  return [...normalized];
}

/** Remove stored order for a workspace when the workspace is deleted. */
export async function clearHomeBoardOrderForWorkspaceForAllUsers(workspaceId: string): Promise<void> {
  const key = workspaceId.trim();
  if (key === '') {
    return;
  }
  await User.updateMany(
    {},
    { $unset: { [`preferences.homeBoardOrderByWorkspace.${key}`]: '' } },
  );
}
