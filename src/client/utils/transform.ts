import type { BoardDB, WorkspaceDB, ListDB, CardDB } from '../store/database.js';

/**
 * Coerce Mongo ObjectId, EJSON `{ $oid }`, or string ids to a plain string for Dexie primary keys.
 * Non-string truthy `id` from the API would otherwise break IndexedDB `put` (invalid key path).
 */
export function extractMongoStringId(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.$oid === 'string' && o.$oid.trim().length > 0) {
      return o.$oid.trim();
    }
    const toString = (value as { toString?: () => string }).toString;
    if (typeof toString === 'function') {
      const s = toString.call(value);
      if (typeof s === 'string' && s.length > 0 && s !== '[object Object]') {
        return s.trim();
      }
    }
  }
  return '';
}

/**
 * Transform MongoDB document format (_id) to Dexie format (id)
 */
export function transformBoard(board: unknown): BoardDB {
  const b = board as {
    _id?: string | { toString: () => string };
    id?: string;
    workspaceId?: string | { toString: () => string } | null;
    ownerId?: string | { toString: () => string } | { _id?: string | { toString: () => string } };
    name: string;
    description?: string;
    descriptionHtml?: string;
    descriptionPreview?: string;
    descriptionCharCount?: number;
    background?: string;
    visibility: 'private' | 'workspace' | 'public';
    members?: Array<{
      userId?: string | { toString: () => string } | { _id?: string | { toString: () => string } };
      role?: string;
      roleKey?: string;
      addedAt?: Date | string;
    }>;
    settings?: {
      allowComments?: boolean;
      allowAttachments?: boolean;
      cardCoverImages?: boolean;
      showDueDateAndReminders?: boolean;
      showLabels?: boolean;
      showAssignees?: boolean;
      showChecklist?: boolean;
      showAttachments?: boolean;
      showComments?: boolean;
      showListCardCount?: boolean;
      showCardDescriptionPreview?: boolean;
      listMaxCards?: number;
      listEnforceMaxCards?: boolean;
      listColumnWidthAuto?: boolean;
      listColumnWidthPx?: number;
    };
    createdAt?: Date | string;
    updatedAt?: Date | string;
    position?: number;
  };

  const id = b.id || (typeof b._id === 'string' ? b._id : b._id?.toString() || '');
  const position = typeof b.position === 'number' && !Number.isNaN(b.position) ? b.position : 0;

  let ownerId = '';
  const rawOwner = b.ownerId;
  if (typeof rawOwner === 'string') {
    ownerId = rawOwner;
  } else if (rawOwner && typeof rawOwner === 'object' && '_id' in rawOwner) {
    const inner = (rawOwner as { _id: unknown })._id;
    ownerId = inner == null ? '' : typeof inner === 'string' ? inner : String(inner);
  }

  // Transform workspaceId
  let workspaceId: string | undefined;
  if (b.workspaceId) {
    if (typeof b.workspaceId === 'string') {
      workspaceId = b.workspaceId;
    } else if (typeof b.workspaceId === 'object' && b.workspaceId !== null) {
      workspaceId = typeof b.workspaceId.toString === 'function' ? b.workspaceId.toString() : String(b.workspaceId);
    }
  }

  // Transform members
  const members = (b.members || []).map((m) => {
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
      addedAt: m.addedAt ? (typeof m.addedAt === 'string' ? new Date(m.addedAt) : m.addedAt) : new Date(),
    };
  });

  return {
    id,
    position,
    ...(workspaceId !== undefined && { workspaceId }),
    name: b.name,
    ...(b.description !== undefined && { description: b.description }),
    ...(b.background !== undefined && { background: b.background }),
    visibility: b.visibility,
    ownerId,
    members,
    settings: {
      allowComments: b.settings?.allowComments ?? true,
      allowAttachments: b.settings?.allowAttachments ?? true,
      cardCoverImages: b.settings?.cardCoverImages ?? true,
      showDueDateAndReminders: b.settings?.showDueDateAndReminders ?? true,
      showLabels: b.settings?.showLabels ?? true,
      showAssignees: b.settings?.showAssignees ?? true,
      showChecklist: b.settings?.showChecklist ?? true,
      showAttachments: b.settings?.showAttachments ?? true,
      showComments: b.settings?.showComments ?? true,
      showListCardCount: b.settings?.showListCardCount ?? true,
      showCardDescriptionPreview: b.settings?.showCardDescriptionPreview ?? true,
      ...(typeof b.settings?.listMaxCards === 'number' && !Number.isNaN(b.settings.listMaxCards)
        ? { listMaxCards: b.settings.listMaxCards }
        : {}),
      ...(b.settings?.listEnforceMaxCards !== undefined
        ? { listEnforceMaxCards: b.settings.listEnforceMaxCards }
        : {}),
      ...(b.settings?.listColumnWidthAuto !== undefined
        ? { listColumnWidthAuto: b.settings.listColumnWidthAuto }
        : {}),
      ...(typeof b.settings?.listColumnWidthPx === 'number' && !Number.isNaN(b.settings.listColumnWidthPx)
        ? { listColumnWidthPx: b.settings.listColumnWidthPx }
        : {}),
    },
    createdAt: b.createdAt ? (typeof b.createdAt === 'string' ? new Date(b.createdAt) : b.createdAt) : new Date(),
    updatedAt: b.updatedAt ? (typeof b.updatedAt === 'string' ? new Date(b.updatedAt) : b.updatedAt) : new Date(),
  };
}

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

export function transformList(list: unknown): ListDB {
  const l = list as {
    _id?: string | { toString: () => string };
    id?: string;
    boardId?: string | { toString: () => string };
    name: string;
    position: number;
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
    ...(l.color !== undefined && { color: l.color }),
    createdAt: l.createdAt ? (typeof l.createdAt === 'string' ? new Date(l.createdAt) : l.createdAt) : new Date(),
    updatedAt: l.updatedAt ? (typeof l.updatedAt === 'string' ? new Date(l.updatedAt) : l.updatedAt) : new Date(),
  };
}

export function transformCard(card: unknown): CardDB {
  const c = card as {
    _id?: string | { toString: () => string };
    id?: string;
    listId?: string | { toString: () => string };
    boardId?: string | { toString: () => string };
    title: string;
    description?: string;
    descriptionHtml?: string;
    descriptionPreview?: string;
    descriptionCharCount?: number;
    position: number;
    color?: string;
    cover?: string;
    labels?: Array<{
      _id?: string | { toString: () => string };
      id?: string;
      name: string;
      color: string;
    }>;
    dueDate?: Date | string;
    startDate?: Date | string;
    completed: boolean;
    completedAt?: Date | string;
    createdBy?: string | { toString: () => string };
    assignees?: Array<string | { toString: () => string } | { _id?: string | { toString: () => string } }>;
    reminders?: Array<{
      _id?: string | { toString: () => string };
      id?: string;
      triggerAt: Date | string;
      repeatFrequency?: string;
      sent: boolean;
      dismissed: boolean;
    }>;
    attachments?: Array<{
      _id?: string | { toString: () => string };
      id?: string;
      name: string;
      url: string;
      originalFileName?: string;
      isPlaceholder?: boolean;
      type: string;
      size: number;
      uploadedAt: Date | string;
      uploadedBy: string | { toString: () => string };
    }>;
    comments?: Array<{
      _id?: string | { toString: () => string };
      id?: string;
      userId: string | { toString: () => string };
      text: string;
      createdAt: Date | string;
      updatedAt: Date | string;
    }>;
    commentCount?: number;
    attachmentCount?: number;
    checklistProgress?: {
      completed: number;
      total: number;
    };
    checklists?: Array<{
      _id?: string | { toString: () => string };
      id?: string;
      title: string;
      items: Array<{
        _id?: string | { toString: () => string };
        id?: string;
        text: string;
        completed: boolean;
        completedAt?: Date | string;
        sortOrder?: number;
      }>;
    }>;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  const id = extractMongoStringId(c.id) || extractMongoStringId(c._id);
  const listId = extractMongoStringId(c.listId);
  const boardId = extractMongoStringId(c.boardId);
  const createdBy = extractMongoStringId(c.createdBy);

  // Transform labels
  const labels = (c.labels || []).map((label) => {
    const labelId = extractMongoStringId(label.id) || extractMongoStringId(label._id);
    return {
      id: labelId,
      name: label.name,
      color: label.color,
    };
  });

  // Transform assignees
  const assignees = (c.assignees || []).map((assignee) => {
    if (typeof assignee === 'string') {
      return assignee;
    }
    if (typeof assignee === 'object' && assignee !== null) {
      if ('_id' in assignee) {
        return extractMongoStringId(assignee._id);
      }
      const fromObj = extractMongoStringId(assignee);
      return fromObj || String(assignee);
    }
    return extractMongoStringId(assignee) || String(assignee);
  });

  // Transform reminders
  const reminders = (c.reminders || []).map((reminder) => {
    const reminderId = extractMongoStringId(reminder.id) || extractMongoStringId(reminder._id);
    return {
      id: reminderId,
      triggerAt: typeof reminder.triggerAt === 'string' ? new Date(reminder.triggerAt) : reminder.triggerAt,
      ...(reminder.repeatFrequency !== undefined && { repeatFrequency: reminder.repeatFrequency }),
      sent: reminder.sent || false,
      dismissed: reminder.dismissed || false,
    };
  });

  // Transform attachments
  const attachments = (c.attachments || []).map((attachment) => {
    const attachmentId = extractMongoStringId(attachment.id) || extractMongoStringId(attachment._id);
    const uploadedBy = extractMongoStringId(attachment.uploadedBy);
    return {
      id: attachmentId,
      name: attachment.name,
      url: attachment.url,
      ...(typeof attachment.originalFileName === 'string' && attachment.originalFileName.trim() !== ''
        ? { originalFileName: attachment.originalFileName.trim() }
        : {}),
      ...(attachment.isPlaceholder === true ? { isPlaceholder: true } : {}),
      type: attachment.type,
      size: attachment.size,
      uploadedAt: typeof attachment.uploadedAt === 'string' ? new Date(attachment.uploadedAt) : attachment.uploadedAt,
      uploadedBy,
    };
  });

  // Transform comments
  const comments = (c.comments || []).map((comment) => {
    const commentId = extractMongoStringId(comment.id) || extractMongoStringId(comment._id);
    const userId = extractMongoStringId(comment.userId);
    return {
      id: commentId,
      userId,
      text: comment.text,
      createdAt: typeof comment.createdAt === 'string' ? new Date(comment.createdAt) : comment.createdAt,
      updatedAt: typeof comment.updatedAt === 'string' ? new Date(comment.updatedAt) : comment.updatedAt,
    };
  });

  // Transform checklists
  const checklists = (c.checklists || []).map((checklist) => {
    const checklistId = extractMongoStringId(checklist.id) || extractMongoStringId(checklist._id);
    return {
      id: checklistId,
      title: checklist.title,
      items: checklist.items.map((item) => {
        const itemId = extractMongoStringId(item.id) || extractMongoStringId(item._id);
        return {
          id: itemId,
          text: item.text,
          completed: item.completed || false,
          ...(item.completedAt !== undefined && {
            completedAt: typeof item.completedAt === 'string' ? new Date(item.completedAt) : item.completedAt,
          }),
          ...(item.sortOrder !== undefined && { sortOrder: item.sortOrder }),
        };
      }),
    };
  });

  return {
    id,
    listId,
    boardId,
    title: c.title,
    ...(c.description !== undefined && { description: c.description }),
    ...(c.descriptionHtml !== undefined && { descriptionHtml: c.descriptionHtml }),
    ...(c.descriptionPreview !== undefined && { descriptionPreview: c.descriptionPreview }),
    ...(typeof c.descriptionCharCount === 'number' && !Number.isNaN(c.descriptionCharCount)
      ? { descriptionCharCount: c.descriptionCharCount }
      : {}),
    position: c.position || 0,
    ...(c.color !== undefined && { color: c.color }),
    ...(c.cover !== undefined && { cover: c.cover }),
    labels,
    ...(c.dueDate !== undefined && {
      dueDate: typeof c.dueDate === 'string' ? new Date(c.dueDate) : c.dueDate,
    }),
    ...(c.startDate !== undefined && {
      startDate: typeof c.startDate === 'string' ? new Date(c.startDate) : c.startDate,
    }),
    completed: c.completed || false,
    ...(c.completedAt !== undefined && {
      completedAt: typeof c.completedAt === 'string' ? new Date(c.completedAt) : c.completedAt,
    }),
    createdBy,
    assignees,
    reminders,
    attachments,
    ...(typeof c.attachmentCount === 'number' && !Number.isNaN(c.attachmentCount)
      ? { attachmentCount: c.attachmentCount }
      : {}),
    comments,
    ...(typeof c.commentCount === 'number' && !Number.isNaN(c.commentCount)
      ? { commentCount: c.commentCount }
      : {}),
    checklists,
    ...(c.checklistProgress !== undefined ? { checklistProgress: c.checklistProgress } : {}),
    createdAt: c.createdAt ? (typeof c.createdAt === 'string' ? new Date(c.createdAt) : c.createdAt) : new Date(),
    updatedAt: c.updatedAt ? (typeof c.updatedAt === 'string' ? new Date(c.updatedAt) : c.updatedAt) : new Date(),
  };
}

/**
 * True when the API payload includes card-detail fields (vs list/kanban summaries).
 * Summaries omit `comments`, `attachments`, `checklists`, `reminders`, and `description`.
 */
export function isCardDetailPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') {
    return false;
  }
  const r = raw as Record<string, unknown>;
  return (
    'comments' in r ||
    'attachments' in r ||
    'checklists' in r ||
    'reminders' in r ||
    'description' in r
  );
}

/**
 * Kanban/list summaries overwrite Dexie via `bulkPut` with sparse rows. Merge preserves
 * detail fields already loaded until a full detail payload arrives.
 */
export function mergeDexieCardIfSnapshot(
  raw: unknown,
  existing: CardDB | undefined,
  incoming: CardDB,
): CardDB {
  if (existing == null || isCardDetailPayload(raw)) {
    return incoming;
  }
  return {
    ...existing,
    ...incoming,
    ...(existing.description !== undefined ? { description: existing.description } : {}),
    ...(existing.descriptionHtml !== undefined ? { descriptionHtml: existing.descriptionHtml } : {}),
    comments: existing.comments,
    checklists: existing.checklists,
    attachments: existing.attachments,
    reminders: existing.reminders,
  };
}

/** Normalize GET /cards/:id (and similar) responses for UI + Dexie. */
export function normalizeCardFromApi(raw: unknown, fallbackId?: string): CardDB {
  const cardData = transformCard(raw);
  const resolvedId =
    extractMongoStringId(cardData.id) ||
    extractMongoStringId((raw as { _id?: unknown } | null)?._id) ||
    (fallbackId?.trim() ?? '');
  if (!resolvedId) {
    throw new Error('Card response missing id');
  }
  return { ...cardData, id: resolvedId };
}
