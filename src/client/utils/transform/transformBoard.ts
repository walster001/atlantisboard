import type { BoardDB } from '../../store/database.js';
import type { BoardThemeSettings } from '../../../shared/boardTheme.js';
import { normalizeBoardThemeSettingsForClient } from '../boardThemeClientNormalize.js';
import {
  boardShowsDueDateOnCards,
  boardShowsEndDateOnCards,
  boardShowsRemindersOnCards,
  boardShowsStartDateOnCards,
} from '../../../shared/utils/boardCardDateVisibility.js';

export function transformBoard(
  board: unknown,
  options?: { readonly prevThemeSettings?: BoardThemeSettings },
): BoardDB {
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
    themeSettings?: BoardThemeSettings;
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
      showRemindersOnCards?: boolean;
      showStartDateOnCards?: boolean;
      showDueDateOnCards?: boolean;
      showEndDateOnCards?: boolean;
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
  const normalizedThemeSettings =
    b.themeSettings !== undefined
      ? normalizeBoardThemeSettingsForClient(id, b.themeSettings, options?.prevThemeSettings)
      : undefined;

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
    ...(normalizedThemeSettings !== undefined ? { themeSettings: normalizedThemeSettings } : {}),
    visibility: b.visibility,
    ownerId,
    members,
    settings: {
      allowComments: b.settings?.allowComments ?? true,
      allowAttachments: b.settings?.allowAttachments ?? true,
      cardCoverImages: b.settings?.cardCoverImages ?? true,
      showReminders: boardShowsRemindersOnCards(b.settings),
      showStartDateOnCards: boardShowsStartDateOnCards(b.settings),
      showDueDateOnCards: boardShowsDueDateOnCards(b.settings),
      showEndDateOnCards: boardShowsEndDateOnCards(b.settings),
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
