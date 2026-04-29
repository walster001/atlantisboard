import Dexie, { type Table } from 'dexie';
import type { BoardThemeSettings } from '../../shared/boardTheme.js';

// Database interfaces
export interface WorkspaceDB {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: Array<{
    userId: string;
    roleKey: string;
    joinedAt: Date;
  }>;
  /** From API: home row is board-scoped only; no workspace management UI. */
  boardScopedHomeOnly?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BoardDB {
  id: string;
  workspaceId?: string;
  /** Home page order within the same workspace (or personal bucket). */
  position: number;
  name: string;
  description?: string;
  background?: string;
  themeSettings?: BoardThemeSettings;
  visibility: 'private' | 'workspace' | 'public';
  ownerId: string;
  members: Array<{
    userId: string;
    roleKey: string;
    addedAt: Date;
  }>;
  settings: {
    allowComments: boolean;
    allowAttachments: boolean;
    cardCoverImages: boolean;
    showReminders: boolean;
    showStartDateOnCards?: boolean;
    showDueDateOnCards?: boolean;
    showEndDateOnCards?: boolean;
    showLabels?: boolean;
    showAssignees?: boolean;
    showChecklist?: boolean;
    showAttachments?: boolean;
    showComments?: boolean;
    /** When true (default), list headers show card counts. */
    showListCardCount?: boolean;
    showCardDescriptionPreview?: boolean;
    /** Board-wide max cards per list (default 1000 when unset). */
    listMaxCards?: number;
    listEnforceMaxCards?: boolean;
    /**
     * Legacy flag; client always uses responsive columns. Saved as true so older servers stay consistent.
     */
    listColumnWidthAuto?: boolean;
    /** Preferred list column width (px) on wide viewports; UI scales down on narrower screens. */
    listColumnWidthPx?: number;
    memberActivityLogRetentionDays?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

/** Client merge helper: `memberActivityLogRetentionDays: null` clears the stored preference. */
export type BoardSettingsLivePatch = Omit<
  Partial<BoardDB['settings']>,
  'memberActivityLogRetentionDays'
> & {
  memberActivityLogRetentionDays?: number | null;
};

export interface ListDB {
  id: string;
  boardId: string;
  name: string;
  position: number;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CardDB {
  id: string;
  listId: string;
  boardId: string;
  title: string;
  description?: string;
  descriptionHtml?: string;
  descriptionPreview?: string;
  descriptionCharCount?: number;
  position: number;
  /** Fractional order within list (server); optional on older IndexedDB rows. */
  pos?: number;
  color?: string;
  cover?: string;
  labels: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  dueDate?: Date;
  startDate?: Date;
  endDate?: Date;
  completed: boolean;
  completedAt?: Date;
  createdBy: string;
  assignees: string[];
  reminders: Array<{
    id: string;
    triggerAt: Date;
    repeatFrequency?: string;
    sent: boolean;
    dismissed: boolean;
  }>;
  attachments: Array<{
    id: string;
    name: string;
    url: string;
    originalFileName?: string;
    isPlaceholder?: boolean;
    type: string;
    size: number;
    uploadedAt: Date;
    uploadedBy: string;
  }>;
  attachmentCount?: number;
  comments: Array<{
    id: string;
    userId: string;
    text: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  commentCount?: number;
  checklists: Array<{
    id: string;
    title: string;
    items: Array<{
      id: string;
      text: string;
      completed: boolean;
      completedAt?: Date;
      sortOrder?: number;
    }>;
  }>;
  checklistProgress?: {
    completed: number;
    total: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDB {
  id: string;
  email: string;
  username: string;
  displayName: string;
  profilePicture?: string | undefined;
  isAppAdmin?: boolean;
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    notifications: boolean;
    language: string;
    notificationPreferences: Record<string, unknown>;
    homeWorkspaceOrder?: string[];
  };
  emailVerified: boolean;
  lastSyncAt?: Date | undefined;
}

export interface OfflineAction {
  id: string;
  type: 'create' | 'update' | 'delete';
  resourceType: 'card' | 'list' | 'board' | 'workspace' | 'comment' | 'checklist' | 'label' | 'attachment';
  resourceId: string;
  action: string; // API endpoint
  payload: unknown;
  timestamp: Date;
  retries: number;
  status: 'pending' | 'processing' | 'failed' | 'completed';
}

class KanboardDatabase extends Dexie {
  workspaces!: Table<WorkspaceDB, string>;
  boards!: Table<BoardDB, string>;
  lists!: Table<ListDB, string>;
  cards!: Table<CardDB, string>;
  users!: Table<UserDB, string>;
  offlineActions!: Table<OfflineAction, string>;

  constructor() {
    super('KanboardDB');
    this.version(1).stores({
      workspaces: 'id, ownerId, visibility, archived',
      boards: 'id, workspaceId, ownerId, visibility, archived',
      lists: 'id, boardId, position, archived',
      cards: 'id, listId, boardId, createdBy, archived, dueDate',
      users: 'id, email, username',
      offlineActions: 'id, status, timestamp, resourceType',
    });
    this.version(2).stores({
      workspaces: 'id, ownerId, visibility',
      boards: 'id, workspaceId, ownerId, visibility',
      lists: 'id, boardId, position',
      cards: 'id, listId, boardId, createdBy, dueDate',
      users: 'id, email, username',
      offlineActions: 'id, status, timestamp, resourceType',
    });
    this.version(3).stores({
      workspaces: 'id, ownerId',
      boards: 'id, workspaceId, ownerId, visibility',
      lists: 'id, boardId, position',
      cards: 'id, listId, boardId, createdBy, dueDate',
      users: 'id, email, username',
      offlineActions: 'id, status, timestamp, resourceType',
    });

    this.version(4)
      .stores({
        workspaces: 'id, ownerId',
        boards: 'id, workspaceId, ownerId, visibility',
        lists: 'id, boardId, position',
        cards: 'id, listId, boardId, createdBy, dueDate',
        users: 'id, email, username',
        offlineActions: 'id, status, timestamp, resourceType',
      })
      .upgrade(async (tx) => {
        await tx
          .table('workspaces')
          .toCollection()
          .modify((workspace) => {
            const w = workspace as unknown as { members?: Array<Record<string, unknown>> };
            if (!Array.isArray(w.members)) {
              return;
            }
            w.members = w.members.map((m) => {
              const roleKey =
                typeof m.roleKey === 'string' && m.roleKey.trim() !== ''
                  ? m.roleKey.trim()
                  : typeof m.role === 'string'
                    ? (m.role === 'member' ? 'viewer' : m.role)
                    : 'viewer';
              const { role: _role, ...rest } = m;
              return { ...rest, roleKey };
            });
          });

        await tx
          .table('boards')
          .toCollection()
          .modify((board) => {
            const b = board as unknown as { members?: Array<Record<string, unknown>> };
            if (!Array.isArray(b.members)) {
              return;
            }
            b.members = b.members.map((m) => {
              const roleKey =
                typeof m.roleKey === 'string' && m.roleKey.trim() !== ''
                  ? m.roleKey.trim()
                  : typeof m.role === 'string'
                    ? (m.role === 'member' ? 'viewer' : m.role)
                    : 'viewer';
              const { role: _role, ...rest } = m;
              return { ...rest, roleKey };
            });
          });
      });
  }
}

export const db = new KanboardDatabase();

