import mongoose from 'mongoose';
import { User } from '../models/User.js';

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

/**
 * For queries this long (after trim), use `$text` so MongoDB can use the text index.
 * Shorter strings stay on regex so typeahead still matches prefixes inside tokens (e.g. "jo" → "John")
 * where the text analyzer may not score usefully.
 */
const TEXT_SEARCH_MIN_LENGTH = 3;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strip characters that break or skew MongoDB `$text` parsing; keep letters, numbers, spaces, email-ish symbols.
 */
function sanitizeForMongoTextSearch(input: string): string | null {
  const cleaned = input
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[^\p{L}\p{N}\s@._+-]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (cleaned.length === 0) {
    return null;
  }
  return cleaned.slice(0, 256);
}

export interface DirectoryUser {
  readonly _id: string;
  readonly displayName: string;
  readonly email: string;
  readonly username: string;
  readonly profilePicture?: string | undefined;
}

export interface DirectorySearchResult {
  readonly users: DirectoryUser[];
  readonly nextCursor?: string | undefined;
}

/**
 * Search registered users for directory / member pickers.
 *
 * - **Empty query**: bounded scan sorted by name (same as before).
 * - **Short query** (< {@link TEXT_SEARCH_MIN_LENGTH}): case-insensitive substring `RegExp` on three fields
 *   (good for typeahead; can be heavy at very large scale).
 * - **Longer query**: `$text` on the `user_directory_text` index (token-based, scales better; behavior is
 *   word-oriented, not arbitrary substring).
 *
 * At very large scale and rich typeahead, consider **MongoDB Atlas Search** (autocomplete / n-gram) instead
 * of relying on regex or plain `$text` alone.
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

  const baseFilter: Record<string, unknown> = {};
  if (excludeIds.length > 0) {
    baseFilter._id = { $nin: excludeIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const q = params.query.trim();
  let useTextScoreSort = false;

  if (q.length > 0) {
    if (q.length >= TEXT_SEARCH_MIN_LENGTH) {
      const textSearch = sanitizeForMongoTextSearch(q);
      if (textSearch !== null) {
        baseFilter.$text = { $search: textSearch, $language: 'en' };
        useTextScoreSort = true;
      } else {
        const re = new RegExp(escapeRegex(q), 'i');
        baseFilter.$or = [{ displayName: re }, { email: re }, { username: re }];
      }
    } else {
      const re = new RegExp(escapeRegex(q), 'i');
      baseFilter.$or = [{ displayName: re }, { email: re }, { username: re }];
    }
  }

  let queryBuilder = User.find(baseFilter)
    .select('_id displayName email username profilePicture')
    .skip(offset)
    .limit(limit);

  if (useTextScoreSort) {
    queryBuilder = queryBuilder.sort({
      score: { $meta: 'textScore' },
      displayName: 1,
      email: 1,
      _id: 1,
    });
  } else {
    queryBuilder = queryBuilder.sort({ displayName: 1, email: 1, _id: 1 });
  }

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
