import { importPreflightUserFromWekanRecord } from '../../../../../shared/import/importSourceUserContact.js';
import type { WekanBoard, WekanCard, WekanList, WekanUser } from '../types.js';
import { normalizeSortValue, readWekanId } from './primitives.js';

export function normalizeWekanUserRecord(record: Record<string, unknown>): WekanUser | null {
  const preflight = importPreflightUserFromWekanRecord(record);
  if (preflight == null) {
    return null;
  }
  return {
    _id: preflight.sourceUserId,
    ...(preflight.username != null ? { username: preflight.username } : {}),
    ...(preflight.fullName != null ? { profile: { fullname: preflight.fullName } } : {}),
    ...(preflight.email != null
      ? { emails: [{ address: preflight.email, verified: false }] }
      : {}),
  };
}

export function normalizeWekanBoardRecord(record: Record<string, unknown>): WekanBoard | null {
  const _id = readWekanId(record._id);
  const title =
    typeof record.title === 'string'
      ? record.title
      : typeof record.name === 'string'
        ? record.name
        : '';
  if (_id == null || title.trim() === '') {
    return null;
  }
  const memberEntries = Array.isArray(record.members)
    ? (record.members as unknown[]).flatMap((member) => {
        if (typeof member !== 'object' || member === null) {
          return [];
        }
        const m = member as Record<string, unknown>;
        const userId = readWekanId(m.userId) ?? readWekanId(m.memberId) ?? readWekanId(m._id);
        if (userId == null) {
          return [];
        }
        return [
          {
            userId,
            isAdmin: m.isAdmin === true,
            isActive: m.isActive !== false,
            isCommentOnly: m.isCommentOnly === true,
            isNoComments: m.isNoComments === true,
            isWorker: m.isWorker === true,
            isReadOnly: m.isReadOnly === true,
            isReadAssignedOnly: m.isReadAssignedOnly === true,
            isNormalAssignedOnly: m.isNormalAssignedOnly === true,
            isCommentAssignedOnly: m.isCommentAssignedOnly === true,
            ...(typeof m.permission === 'string' && m.permission.trim() !== '' ? { permission: m.permission.trim() } : {}),
          },
        ];
      })
    : undefined;
  return {
    _id,
    title,
    ...(typeof record.description === 'string' ? { description: record.description } : {}),
    archived: record.archived === true,
    ...(typeof record.background === 'string' ? { background: record.background } : {}),
    ...(record.permission === 'private' || record.permission === 'public' ? { permission: record.permission } : {}),
    ...(memberEntries !== undefined ? { members: memberEntries } : {}),
  };
}

export function normalizeWekanListRecord(record: Record<string, unknown>, parentBoardId?: string): WekanList | null {
  const _id = readWekanId(record._id);
  const boardId = readWekanId(record.boardId) ?? readWekanId(record.idBoard) ?? readWekanId(record.board) ?? parentBoardId;
  const title =
    typeof record.title === 'string'
      ? record.title
      : typeof record.name === 'string'
        ? record.name
        : '';
  if (_id == null || boardId == null || title.trim() === '') {
    return null;
  }

  const sort = normalizeSortValue(record.sort ?? record.pos ?? record.position);
  return {
    _id,
    boardId,
    title,
    sort,
    archived: record.archived === true,
    ...(typeof record.color === 'string' ? { color: record.color } : {}),
    ...(typeof record.wipLimit === 'number' && Number.isFinite(record.wipLimit) ? { wipLimit: record.wipLimit } : {}),
  };
}

export function normalizeWekanCardRecord(record: Record<string, unknown>, parentBoardId?: string): WekanCard | null {
  const _id = readWekanId(record._id);
  const listId = readWekanId(record.listId) ?? readWekanId(record.idList) ?? readWekanId(record.list);
  const boardId = readWekanId(record.boardId) ?? readWekanId(record.idBoard) ?? readWekanId(record.board) ?? parentBoardId;
  const title =
    typeof record.title === 'string'
      ? record.title
      : typeof record.name === 'string'
        ? record.name
        : '';
  if (_id == null || listId == null || boardId == null || title.trim() === '') {
    return null;
  }

  const sort = normalizeSortValue(record.sort ?? record.pos ?? record.position);
  return {
    _id,
    listId,
    boardId,
    title,
    sort,
    archived: record.archived === true,
    ...(typeof record.color === 'string' ? { color: record.color } : {}),
    ...(typeof record.description === 'string' ? { description: record.description } : {}),
    ...(typeof record.dueAt === 'string' ? { dueAt: record.dueAt } : {}),
    ...(typeof record.startAt === 'string' ? { startAt: record.startAt } : {}),
    ...(typeof record.finishedAt === 'string' ? { finishedAt: record.finishedAt } : {}),
    ...(typeof record.cover === 'string' ? { cover: record.cover } : {}),
    ...(Array.isArray(record.members)
      ? { members: record.members.map((m) => readWekanId(m)).filter((m): m is string => m !== undefined) }
      : {}),
    ...(Array.isArray(record.labelIds)
      ? { labelIds: record.labelIds.map((id) => readWekanId(id)).filter((id): id is string => id !== undefined) }
      : Array.isArray(record.labels)
        ? { labelIds: record.labels.map((label) => readWekanId(label)).filter((id): id is string => id !== undefined) }
        : {}),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    modifiedAt: typeof record.modifiedAt === 'string' ? record.modifiedAt : new Date().toISOString(),
  };
}
