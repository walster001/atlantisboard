import type { ListDB } from '../../store/database.js';
import { extractMongoStringId } from '../../../shared/mongoId.js';

export function transformList(list: unknown): ListDB {
  const l = list as {
    _id?: string | { toString: () => string };
    id?: string;
    boardId?: string | { toString: () => string };
    name: string;
    position: number;
    pos?: number;
    color?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  const id = extractMongoStringId(l.id) || extractMongoStringId(l._id);
  const boardId = extractMongoStringId(l.boardId);

  return {
    id,
    boardId,
    name: l.name,
    position: l.position || 0,
    ...(typeof l.pos === 'number' && Number.isFinite(l.pos) ? { pos: l.pos } : {}),
    ...(l.color !== undefined && { color: l.color }),
    createdAt: l.createdAt ? (typeof l.createdAt === 'string' ? new Date(l.createdAt) : l.createdAt) : new Date(),
    updatedAt: l.updatedAt ? (typeof l.updatedAt === 'string' ? new Date(l.updatedAt) : l.updatedAt) : new Date(),
  };
}
