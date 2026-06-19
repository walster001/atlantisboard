export type ViewMode = 'summary' | 'detail';
import type { AttachmentScanStatus } from '../attachmentScanStatus.js';
import type { BoardThemeSettings, BoardThemeSettingsStored } from '../boardTheme.js';
import type { BoardActivityTrackingSettings } from '../constants/boardContentActivities.js';

export interface WorkspaceSummaryDTO {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  /** Present when the user is a workspace member or owner. Omitted for board-only home rows. */
  members?: Array<{
    userId: string;
    roleKey: string;
    joinedAt: Date;
  }>;
  /**
   * When true, this workspace appears on the home list only because the user has board access;
   * they are not a workspace member (no workspace management or member list).
   */
  boardScopedHomeOnly?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Mirrors persisted board settings — required on summaries so clients do not reset toggles to defaults. */
export interface BoardSettingsDTO {
  allowComments: boolean;
  allowAttachments: boolean;
  cardCoverImages: boolean;
  showRemindersOnCards: boolean;
  showStartDateOnCards: boolean;
  showDueDateOnCards: boolean;
  showEndDateOnCards: boolean;
  showLabels: boolean;
  showAssignees: boolean;
  showChecklist: boolean;
  showAttachments: boolean;
  showComments: boolean;
  showListCardCount: boolean;
  showCardDescriptionPreview: boolean;
  listMaxCards?: number;
  listEnforceMaxCards?: boolean;
  listColumnWidthAuto?: boolean;
  listColumnWidthPx?: number;
  memberActivityLogRetentionDays?: number;
  activityLogEnabled?: boolean;
  activityLogRetentionDays?: number;
  activityLogTracking?: BoardActivityTrackingSettings;
  activityLogEmailRoundupEnabled?: boolean;
  activityLogEmailRoundupUserIds?: string[];
}

export interface BoardSummaryDTO {
  id: string;
  workspaceId?: string;
  position: number;
  name: string;
  description?: string;
  background?: string;
  themeSettings?: BoardThemeSettings | BoardThemeSettingsStored;
  visibility: 'private' | 'workspace' | 'public';
  ownerId: string;
  members: Array<{
    userId: string;
    roleKey: string;
    addedAt: Date;
  }>;
  settings: BoardSettingsDTO;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChecklistProgressDTO {
  completed: number;
  total: number;
}

export interface CardSummaryDTO {
  id: string;
  listId: string;
  boardId: string;
  title: string;
  position: number;
  /** Fractional sort key within the list (Trello-style); falls back to spread from `position` when unset. */
  pos: number;
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
  descriptionPreview: string;
  descriptionCharCount: number;
  attachmentCount: number;
  commentCount: number;
  checklistProgress: ChecklistProgressDTO;
  createdAt: Date;
  updatedAt: Date;
}

export interface CardDetailDTO {
  id: string;
  listId: string;
  boardId: string;
  title: string;
  /** Rich description JSON string; empty when unset (detail payloads always include this key). */
  description: string;
  descriptionHtml?: string;
  descriptionPreview: string;
  descriptionCharCount: number;
  position: number;
  pos: number;
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
    /** Import source filename for matching after upload. */
    originalFileName?: string;
    isPlaceholder?: boolean;
    scanStatus?: AttachmentScanStatus;
    type: string;
    size: number;
    uploadedAt: Date;
    uploadedBy: string;
  }>;
  comments: Array<{
    id: string;
    userId: string;
    text: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
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
  createdAt: Date;
  updatedAt: Date;
}
