import type { BoardVisibility } from '../../models/Board.js';
import type { BoardSummaryDTO } from '../../../shared/types/viewModels.js';
import type { BoardThemeSettings } from '../../../shared/boardTheme.js';
import type { BoardActivityTrackingSettings } from '../../../shared/constants/boardContentActivities.js';

export interface CreateBoardInput {
  workspaceId: string;
  name: string;
  description?: string | undefined;
  background?: string | undefined;
  themeSettings?: BoardThemeSettings | undefined;
  visibility?: BoardVisibility | undefined;
  ownerId: string;
}

export interface UpdateBoardInput {
  workspaceId?: string | null | undefined;
  name?: string | undefined;
  description?: string | undefined;
  background?: string | undefined;
  themeSettings?: BoardThemeSettings | undefined;
  visibility?: BoardVisibility | undefined;
  settings?: {
    allowComments?: boolean | undefined;
    allowAttachments?: boolean | undefined;
    cardCoverImages?: boolean | undefined;
    showDueDateAndReminders?: boolean | undefined;
    showRemindersOnCards?: boolean | undefined;
    showStartDateOnCards?: boolean | undefined;
    showDueDateOnCards?: boolean | undefined;
    showEndDateOnCards?: boolean | undefined;
    showLabels?: boolean | undefined;
    showAssignees?: boolean | undefined;
    showChecklist?: boolean | undefined;
    showAttachments?: boolean | undefined;
    showComments?: boolean | undefined;
    showListCardCount?: boolean | undefined;
    showCardDescriptionPreview?: boolean | undefined;
    listMaxCards?: number | undefined;
    listEnforceMaxCards?: boolean | undefined;
    listColumnWidthAuto?: boolean | undefined;
    listColumnWidthPx?: number | undefined;
    memberActivityLogRetentionDays?: number | null | undefined;
    activityLogEnabled?: boolean | undefined;
    activityLogRetentionDays?: number | null | undefined;
    activityLogTracking?: BoardActivityTrackingSettings | undefined;
    activityLogEmailRoundupEnabled?: boolean | undefined;
    activityLogEmailRoundupUserIds?: string[] | undefined;
  } | undefined;
}

export type BoardViewMode = 'summary' | 'detail';

/** Optional pagination for board list endpoints (`skip` defaults to 0 when `limit` is set). */
export interface BoardListQueryOptions {
  view?: BoardViewMode | undefined;
  skip?: number | undefined;
  limit?: number | undefined;
}

export interface BoardMemberListItem {
  userId: string;
  displayName: string;
  email: string;
  profilePicture?: string;
  role: 'owner' | 'member';
  roleKey: string;
  addedAt?: Date;
  importPlaceholder?: boolean;
  importNotMapped?: boolean;
}

export interface BoardMemberListResult {
  members: BoardMemberListItem[];
  nextCursor?: string;
}

/** Optional display name from the HTTP layer to avoid an extra User read on hot paths. */
export interface BoardMemberAuditHints {
  readonly targetDisplayName?: string;
}

export interface BoardKanbanSnapshotForUser {
  board: BoardSummaryDTO;
  lists: unknown[];
  cardsByList: Record<string, unknown[]>;
}
