import type { BoardThemeSettings } from '../../../shared/boardTheme.js';
import type { ApiClient } from '../api.js';

export interface BoardApiMethods {
  getBoards(options?: {
    workspaceId?: string;
    view?: 'summary' | 'detail';
    fields?: readonly string[];
    cacheBust?: boolean;
    skip?: number;
    limit?: number;
  }): Promise<{ boards: unknown[]; hasMore?: boolean }>;
  getBoardsByWorkspace(
    workspaceId: string,
    options?: { view?: 'summary' | 'detail'; skip?: number; limit?: number }
  ): Promise<{ boards: unknown[]; hasMore?: boolean }>;
  getBoard(
    id: string,
    requestConfig?: { signal?: AbortSignal; view?: 'summary' | 'detail' }
  ): Promise<{ board: unknown }>;
  getMyBoardPermissions(boardId: string): Promise<{ boardId: string; permissions: string[]; serverTs: number }>;
  createBoard(data: {
    workspaceId: string;
    name: string;
    description?: string;
    background?: string;
    themeSettings?: BoardThemeSettings;
    visibility?: 'private' | 'workspace' | 'public';
  }): Promise<{ board: unknown }>;
  updateBoard(id: string, data: {
    name?: string;
    description?: string;
    background?: string;
    themeSettings?: BoardThemeSettings;
    visibility?: 'private' | 'workspace' | 'public';
    workspaceId?: string | null;
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
      memberActivityLogRetentionDays?: number | null;
    };
  }): Promise<{ board: unknown }>;
  uploadBoardBackgroundImage(
    boardId: string,
    file: File,
    options?: {
      backgroundImageScale?: 'fill' | 'fit' | 'fit-top-left' | 'smart-fill';
      backgroundFocalX?: number;
      backgroundFocalY?: number;
    },
  ): Promise<{ url: string; board: unknown }>;
  deleteBoardBackgroundImage(boardId: string): Promise<{ board: unknown }>;
  reorderHomeBoards(payload: { workspaceId: string; orderedBoardIds: readonly string[] }): Promise<{ message: string }>;
  deleteBoard(id: string): Promise<void>;
  addBoardMember(boardId: string, userId: string, roleKey: string): Promise<{ board: unknown }>;
  removeBoardMember(boardId: string, userId: string): Promise<void>;
  updateBoardMemberRole(boardId: string, userId: string, roleKey: string): Promise<{ board: unknown }>;
  getBoardAssignableRoles(boardId: string): Promise<{
    roles: Array<{ key: string; displayName: string; isBuiltIn: boolean }>;
  }>;
  getBoardMembers(
    boardId: string,
    options?: {
      q?: string;
      sort?: 'displayName:asc' | 'displayName:desc' | 'email:asc' | 'email:desc';
      cursor?: string;
      limit?: number;
    }
  ): Promise<{ members: unknown[]; nextCursor?: string }>;
}

export const boardApiMethods: BoardApiMethods = {
  async getBoards(this: ApiClient, options) {
    const params = new URLSearchParams();
    if (options?.workspaceId !== undefined) params.set('workspaceId', options.workspaceId);
    if (options?.view !== undefined) params.set('view', options.view);
    if (Array.isArray(options?.fields) && options.fields.length > 0) params.set('fields', options.fields.join(','));
    if (options?.skip !== undefined) params.set('skip', String(options.skip));
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.cacheBust === true) params.set('_', String(Date.now()));
    const suffix = params.toString();
    const response = await this.client.get(`/boards${suffix === '' ? '' : `?${suffix}`}`);
    return response.data as { boards: unknown[]; hasMore?: boolean };
  },

  async getBoardsByWorkspace(this: ApiClient, workspaceId, options) {
    const params = new URLSearchParams();
    if (options?.view !== undefined) params.set('view', options.view);
    if (options?.skip !== undefined) params.set('skip', String(options.skip));
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    const suffix = params.toString();
    const response = await this.client.get(`/boards/workspace/${workspaceId}${suffix === '' ? '' : `?${suffix}`}`);
    return response.data as { boards: unknown[]; hasMore?: boolean };
  },

  async getBoard(this: ApiClient, id, requestConfig) {
    const params = new URLSearchParams();
    if (requestConfig?.view !== undefined) params.set('view', requestConfig.view);
    const qs = params.toString();
    const response = await this.client.get(
      `/boards/${id}${qs === '' ? '' : `?${qs}`}`,
      requestConfig?.signal !== undefined ? { signal: requestConfig.signal } : undefined,
    );
    return response.data as { board: unknown };
  },

  async getMyBoardPermissions(this: ApiClient, boardId) {
    const response = await this.client.get(`/boards/${boardId}/permissions/me`);
    return response.data as { boardId: string; permissions: string[]; serverTs: number };
  },

  async createBoard(this: ApiClient, data) {
    const response = await this.client.post('/boards', data);
    return response.data as { board: unknown };
  },

  async updateBoard(this: ApiClient, id, data) {
    const response = await this.client.put(`/boards/${id}`, data);
    return response.data as { board: unknown };
  },

  async uploadBoardBackgroundImage(this: ApiClient, boardId, file, options) {
    const form = new FormData();
    form.append('file', file);
    if (options?.backgroundImageScale != null) form.append('backgroundImageScale', options.backgroundImageScale);
    if (options?.backgroundFocalX != null && Number.isFinite(options.backgroundFocalX)) {
      form.append('backgroundFocalX', String(options.backgroundFocalX));
    }
    if (options?.backgroundFocalY != null && Number.isFinite(options.backgroundFocalY)) {
      form.append('backgroundFocalY', String(options.backgroundFocalY));
    }
    const response = await this.client.post<{ url: string; board: unknown }>(`/boards/${boardId}/background-image`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async deleteBoardBackgroundImage(this: ApiClient, boardId) {
    const response = await this.client.delete<{ board: unknown }>(`/boards/${boardId}/background-image`);
    return response.data;
  },

  async reorderHomeBoards(this: ApiClient, payload) {
    const response = await this.client.put('/boards/reorder', payload);
    return response.data as { message: string };
  },

  async deleteBoard(this: ApiClient, id) {
    await this.client.delete(`/boards/${id}`);
  },

  async addBoardMember(this: ApiClient, boardId, userId, roleKey) {
    const response = await this.client.post(`/boards/${boardId}/members`, { userId, roleKey });
    return response.data as { board: unknown };
  },

  async removeBoardMember(this: ApiClient, boardId, userId) {
    await this.client.delete(`/boards/${boardId}/members/${userId}`);
  },

  async updateBoardMemberRole(this: ApiClient, boardId, userId, roleKey) {
    const response = await this.client.put(`/boards/${boardId}/members/${userId}/role`, { roleKey });
    return response.data as { board: unknown };
  },

  async getBoardAssignableRoles(this: ApiClient, boardId) {
    const response = await this.client.get(`/boards/${boardId}/roles`);
    return response.data as { roles: Array<{ key: string; displayName: string; isBuiltIn: boolean }> };
  },

  async getBoardMembers(this: ApiClient, boardId, options) {
    const params = new URLSearchParams();
    if (options?.q !== undefined && options.q !== '') params.set('q', options.q);
    if (options?.sort !== undefined) params.set('sort', options.sort);
    if (options?.cursor !== undefined && options.cursor !== '') params.set('cursor', options.cursor);
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    const suffix = params.toString();
    const response = await this.client.get(`/boards/${boardId}/members${suffix === '' ? '' : `?${suffix}`}`);
    return response.data as { members: unknown[]; nextCursor?: string };
  },
};
