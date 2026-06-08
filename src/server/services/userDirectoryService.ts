import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { getBoardById } from './boardService/queries.js';
import { listBoardImportPlaceholderDirectoryRows } from './boardImportPlaceholderService.js';

const MAX_LIMIT = 120;

function decodeSkipCursor(cursor: string | undefined): number {
  if (cursor === undefined || cursor === '') {
    return 0;
  }
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function encodeSkipCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive substring match on display name, email, and username. */
export function buildUserDirectoryRegexFilter(query: string): RegExp {
  return new RegExp(escapeRegex(query.trim()), 'i');
}

export interface DirectoryUser {
  readonly _id: string;
  readonly displayName: string;
  readonly email: string;
  readonly username: string;
  readonly profilePicture?: string | undefined;
  /** Board import placeholder still on this board's directory list. */
  readonly importPlaceholder?: boolean | undefined;
  /** Placeholder not yet claimed by a real account login. */
  readonly importNotMapped?: boolean | undefined;
  /** Role from import mapping (placeholder rows only). */
  readonly importRoleKey?: string | undefined;
  /** Current role applied when placeholder is claimed (placeholder rows only). */
  readonly importPlaceholderRoleKey?: string | undefined;
}

export interface DirectorySearchResult {
  readonly users: DirectoryUser[];
  readonly nextCursor?: string | undefined;
}

/**
 * Search registered users for directory / member pickers.
 *
 * Uses case-insensitive substring matching on display name, email, and username so partial
 * queries (e.g. "atlantis" → "atlantisbaseimage@…") work consistently.
 */
export async function searchRegisteredUsers(params: {
  query: string;
  limit: number;
  excludeUserIds: readonly string[];
  cursor?: string | undefined;
}): Promise<DirectorySearchResult> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, params.limit));
  const offset = decodeSkipCursor(params.cursor);
  const excludeIds = params.excludeUserIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

  const baseFilter: Record<string, unknown> = {
    isPlaceholder: { $ne: true },
  };
  if (excludeIds.length > 0) {
    baseFilter._id = { $nin: excludeIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const q = params.query.trim();
  if (q.length > 0) {
    const re = buildUserDirectoryRegexFilter(q);
    baseFilter.$or = [{ displayName: re }, { email: re }, { username: re }];
  }

  const queryBuilder = User.find(baseFilter)
    .select('_id displayName email username profilePicture')
    .skip(offset)
    .limit(limit)
    .sort({ displayName: 1, email: 1, _id: 1 });

  const users = await queryBuilder.lean();

  const mapped = users.map((u) => {
    const id = u._id;
    const base: DirectoryUser = {
      _id: typeof id === 'string' ? id : id.toString(),
      displayName: u.displayName,
      email: u.email,
      username: u.username,
    };
    if (u.profilePicture !== undefined && u.profilePicture !== '') {
      return { ...base, profilePicture: u.profilePicture };
    }
    return base;
  });

  const nextCursor =
    mapped.length === limit ? encodeSkipCursor(offset + limit) : undefined;
  return { users: mapped, nextCursor };
}

/**
 * Board-scoped import placeholders (shown in board settings "All Users" with import badges).
 */
export async function listBoardImportPlaceholderDirectoryUsers(params: {
  readonly boardId: string;
  readonly requesterUserId: string;
  readonly query: string;
  readonly limit: number;
}): Promise<readonly DirectoryUser[]> {
  const board = await getBoardById(params.boardId, params.requesterUserId);
  if (!board || !('_id' in board)) {
    return [];
  }
  const rows = await listBoardImportPlaceholderDirectoryRows({
    boardId: params.boardId,
    query: params.query,
    limit: params.limit,
  });
  return rows.map((row) => ({
    _id: row._id,
    displayName: row.displayName,
    email: row.email,
    username: row.username,
    importPlaceholder: true,
    importNotMapped: true,
    importRoleKey: row.importRoleKey,
    importPlaceholderRoleKey: row.roleKey,
  }));
}
