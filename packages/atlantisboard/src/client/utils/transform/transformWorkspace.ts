import type { WorkspaceDB } from '../../store/database.js';

export function transformWorkspace(workspace: unknown): WorkspaceDB {
  const w = workspace as {
    _id?: string | { toString: () => string };
    id?: string;
    ownerId?: string | { toString: () => string } | { _id?: string | { toString: () => string } };
    name: string;
    description?: string;
    members?: Array<{
      userId?: string | { toString: () => string } | { _id?: string | { toString: () => string } };
      role?: string;
      roleKey?: string;
      joinedAt?: Date | string;
    }>;
    boardScopedHomeOnly?: unknown;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  const id = w.id || (typeof w._id === 'string' ? w._id : w._id?.toString() || '');

  let ownerId = '';
  const rawWOwner = w.ownerId;
  if (typeof rawWOwner === 'string') {
    ownerId = rawWOwner;
  } else if (rawWOwner && typeof rawWOwner === 'object' && '_id' in rawWOwner) {
    const inner = (rawWOwner as { _id: unknown })._id;
    ownerId = inner == null ? '' : typeof inner === 'string' ? inner : String(inner);
  } else if (rawWOwner && typeof rawWOwner === 'object') {
    const toString = (rawWOwner as { toString?: () => string }).toString;
    if (typeof toString === 'function') {
      const v = toString.call(rawWOwner);
      if (typeof v === 'string' && v !== '' && v !== '[object Object]') {
        ownerId = v;
      }
    }
  }

  // Transform members
  const members = (w.members || []).map((m) => {
    let userId: string;
    if (typeof m.userId === 'string') {
      userId = m.userId;
    } else if (typeof m.userId === 'object' && m.userId !== null) {
      if ('_id' in m.userId) {
        const userIdObj = m.userId._id;
        userId = typeof userIdObj === 'string' ? userIdObj : userIdObj?.toString() || '';
      } else {
        userId = typeof m.userId.toString === 'function' ? m.userId.toString() : String(m.userId);
      }
    } else {
      userId = String(m.userId);
    }

    return {
      userId,
      roleKey:
        typeof m.roleKey === 'string' && m.roleKey.trim() !== ''
          ? m.roleKey.trim()
          : typeof m.role === 'string' && m.role.trim() !== ''
            ? (m.role === 'member' ? 'viewer' : m.role)
            : 'viewer',
      joinedAt: m.joinedAt ? (typeof m.joinedAt === 'string' ? new Date(m.joinedAt) : m.joinedAt) : new Date(),
    };
  });

  return {
    id,
    name: w.name,
    ...(w.description !== undefined && { description: w.description }),
    ownerId,
    members,
    ...(w.boardScopedHomeOnly === true ? { boardScopedHomeOnly: true as const } : {}),
    createdAt: w.createdAt ? (typeof w.createdAt === 'string' ? new Date(w.createdAt) : w.createdAt) : new Date(),
    updatedAt: w.updatedAt ? (typeof w.updatedAt === 'string' ? new Date(w.updatedAt) : w.updatedAt) : new Date(),
  };
}
