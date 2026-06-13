export interface AdminMemberActivityReportRow {
  readonly _id: string;
  readonly boardId: string;
  readonly boardName: string;
  readonly type: string;
  readonly description: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly userId: {
    readonly _id?: string;
    readonly displayName?: string;
    readonly email?: string;
    readonly profilePicture?: string;
  } | string;
}

export interface AdminMemberActivityReportResponse {
  readonly activities: readonly AdminMemberActivityReportRow[];
  readonly nextCursor?: string;
}

export interface AdminReportingBoardOption {
  readonly id: string;
  readonly name: string;
}

export interface AdminReportingBoardOptionsResponse {
  readonly boards: readonly AdminReportingBoardOption[];
}

export interface AdminBoardActivityReportRow {
  readonly _id: string;
  readonly boardId: string;
  readonly boardName: string;
  readonly type: string;
  readonly description: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly userId: {
    readonly _id?: string;
    readonly displayName?: string;
    readonly email?: string;
    readonly profilePicture?: string;
  } | string;
}

export interface AdminBoardActivityReportResponse {
  readonly activities: readonly AdminBoardActivityReportRow[];
  readonly nextCursor?: string;
}

export interface AdminBoardListReportRow {
  readonly _id: string;
  readonly name: string;
  readonly workspaceId?: string;
  readonly workspaceName?: string;
  readonly ownerId: string;
  readonly ownerDisplayName?: string;
  readonly memberCount: number;
  readonly visibility: 'private' | 'workspace' | 'public';
  readonly position: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AdminBoardListReportResponse {
  readonly boards: readonly AdminBoardListReportRow[];
  readonly nextCursor?: string;
}

export interface AdminCardListReportRow {
  readonly _id: string;
  readonly boardId: string;
  readonly boardName: string;
  readonly listId: string;
  readonly listName: string;
  readonly title: string;
  readonly position: number;
  readonly pos?: number;
  readonly dueDate?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly completed: boolean;
  readonly completedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string;
  readonly assigneeCount: number;
  readonly assigneeIds: readonly string[];
  readonly labelCount: number;
}

export interface AdminCardListReportResponse {
  readonly cards: readonly AdminCardListReportRow[];
  readonly nextCursor?: string;
}
