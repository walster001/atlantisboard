import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { env } from '../config/env.js';
import type { PublicLoginOptions } from '../../shared/types/loginOptions.js';
import type { PublicLoginBranding } from '../../shared/types/loginBranding.js';
import type { PublicAppBranding } from '../../shared/types/appBranding.js';
import type { PublicCustomFontEntry } from '../../shared/types/customFonts.js';
import type { ImportPreflightPayload } from '../../shared/import/importPreflight.js';

const API_BASE_URL = env.API_BASE_URL || '/api/v1';

let fontsCatalogCache: Promise<{ fonts: PublicCustomFontEntry[] }> | null = null;

export function invalidateFontsCatalogCache(): void {
  fontsCatalogCache = null;
}

/** Paths that do not require authentication; redirect to login is skipped on these. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/verify-email') ||
    pathname.startsWith('/invite/')
  );
}

class ApiClient {
  private client: AxiosInstance;
  private csrfToken: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });

    // Initialize CSRF token
    this.fetchCSRFToken().catch(() => {
      // Silently fail, will try again on next request
    });

    // Request interceptor to add auth token and CSRF token
    this.client.interceptors.request.use(
      async (config) => {
        const token = this.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add CSRF token for state-changing requests
        if (config.method && ['post', 'put', 'patch', 'delete'].includes(config.method.toLowerCase())) {
          if (!this.csrfToken) {
            await this.fetchCSRFToken();
          }
          if (this.csrfToken) {
            config.headers['X-CSRF-Token'] = this.csrfToken;
          }
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling and CSRF token extraction
    this.client.interceptors.response.use(
      (response) => {
        // Extract CSRF token from response header or cookie
        const csrfTokenHeader = response.headers['x-csrf-token'];
        if (csrfTokenHeader) {
          this.csrfToken = csrfTokenHeader;
        }

        // Also check cookie (if accessible)
        const cookies = document.cookie.split(';');
        const csrfCookie = cookies.find((c) => c.trim().startsWith('csrf-token='));
        if (csrfCookie) {
          this.csrfToken = csrfCookie.split('=')[1];
        }

        return response;
      },
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Clear token
          this.clearToken();
          if (!isPublicPath(window.location.pathname)) {
            window.location.href = '/login';
          }
        }
        if (error.response?.status === 403 && error.response?.data && typeof error.response.data === 'object' && 'error' in error.response.data) {
          const errorData = error.response.data as { error?: { code?: string } };
          if (errorData.error?.code === 'CSRF_TOKEN_MISSING' || errorData.error?.code === 'CSRF_TOKEN_INVALID') {
            // CSRF token invalid or missing, fetch new one and retry
            this.fetchCSRFToken().catch(() => {
              // Silently fail
            });
          }
        }
        return Promise.reject(error);
      }
    );
  }

  private async fetchCSRFToken(): Promise<void> {
    try {
      const response = await this.client.get('/csrf/token');
      if (response.data?.csrfToken) {
        this.csrfToken = response.data.csrfToken;
      }
    } catch {
      /* will try again on next request */
    }
  }

  private getToken(): string | null {
    // Try to get token from cookie (set by server) or localStorage
    return localStorage.getItem('token') || null;
  }

  private clearToken(): void {
    localStorage.removeItem('token');
  }

  setToken(token: string): void {
    localStorage.setItem('token', token);
  }

  // Auth endpoints
  async register(data: {
    email: string;
    username: string;
    password: string;
    displayName: string;
  }): Promise<unknown> {
    const response = await this.client.post('/auth/register', data);
    if (response.data && typeof response.data === 'object' && 'token' in response.data) {
      const token = (response.data as { token?: string }).token;
      if (token) {
        this.setToken(token);
      }
    }
    return response.data;
  }

  async login(email: string, password: string): Promise<{ token: string; user: unknown }> {
    const response = await this.client.post('/auth/login', { email, password });
    const data = response.data;
    if (data != null && typeof data === 'object' && 'token' in data) {
      const token = (data as { token?: unknown }).token;
      if (typeof token === 'string' && token.length > 0) {
        this.setToken(token);
      }
    }
    return data as { token: string; user: unknown };
  }

  async logout(): Promise<void> {
    await this.client.post('/auth/logout');
    this.clearToken();
  }

  async getCurrentUser(): Promise<unknown> {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  async forgotPassword(email: string): Promise<void> {
    await this.client.post('/auth/forgot-password', { email });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await this.client.post('/auth/reset-password', { token, password });
  }

  async verifyEmail(token: string): Promise<void> {
    await this.client.get('/auth/verify-email', { params: { token } });
  }

  async getLoginOptions(): Promise<PublicLoginOptions> {
    const response = await this.client.get<PublicLoginOptions>('/auth/login-options');
    return response.data;
  }

  async getLoginBranding(): Promise<{ branding: PublicLoginBranding }> {
    const response = await this.client.get<{ branding: PublicLoginBranding }>(
      '/auth/login-branding'
    );
    return response.data;
  }

  async getAppBranding(): Promise<{ appBranding: PublicAppBranding }> {
    const response = await this.client.get<{ appBranding: PublicAppBranding }>('/auth/app-branding');
    return response.data;
  }

  async uploadBrandingFile(
    file: File,
    type: 'logo' | 'favicon' | 'home-nav-icon' | 'home-bg-image' | 'board-nav-icon'
  ): Promise<{ url: string }> {
    const form = new FormData();
    form.append('file', file);
    /** Must not use default `application/json` — axios would stringify FormData and multer sees no file. */
    const response = await this.client.post<{ url: string }>(
      `/admin/branding/upload?type=${type}`,
      form,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  }

  async deleteBrandingFile(url: string): Promise<void> {
    await this.client.delete('/admin/branding/file', {
      data: { url },
    });
  }

  // Workspace endpoints
  async getWorkspaces(options?: {
    view?: 'summary' | 'detail';
    fields?: readonly string[];
  }): Promise<{ workspaces: unknown[] }> {
    const params = new URLSearchParams();
    if (options?.view !== undefined) {
      params.set('view', options.view);
    }
    if (Array.isArray(options?.fields) && options.fields.length > 0) {
      params.set('fields', options.fields.join(','));
    }
    const suffix = params.toString();
    const response = await this.client.get(`/workspaces${suffix === '' ? '' : `?${suffix}`}`);
    return response.data;
  }

  async getWorkspace(
    id: string,
    requestConfig?: { signal?: AbortSignal; view?: 'summary' | 'detail' }
  ): Promise<{ workspace: unknown }> {
    const params = new URLSearchParams();
    if (requestConfig?.view !== undefined) {
      params.set('view', requestConfig.view);
    }
    const qs = params.toString();
    const response = await this.client.get(
      `/workspaces/${id}${qs === '' ? '' : `?${qs}`}`,
      requestConfig?.signal !== undefined ? { signal: requestConfig.signal } : undefined,
    );
    return response.data;
  }

  async createWorkspace(data: {
    name: string;
    description?: string;
  }): Promise<{ workspace: unknown }> {
    const response = await this.client.post('/workspaces', data);
    return response.data;
  }

  async updateWorkspace(id: string, data: {
    name?: string;
    description?: string;
  }): Promise<{ workspace: unknown }> {
    const response = await this.client.put(`/workspaces/${id}`, data);
    return response.data;
  }

  async deleteWorkspace(id: string): Promise<void> {
    await this.client.delete(`/workspaces/${id}`);
  }

  async addWorkspaceMember(workspaceId: string, userId: string, roleKey: string): Promise<{ workspace: unknown }> {
    const response = await this.client.post(`/workspaces/${workspaceId}/members`, { userId, roleKey });
    return response.data;
  }

  async removeWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<{ workspace: unknown }> {
    const response = await this.client.delete(`/workspaces/${workspaceId}/members/${userId}`);
    return response.data as { workspace: unknown };
  }

  async updateWorkspaceMemberRole(workspaceId: string, userId: string, roleKey: string): Promise<{ workspace: unknown }> {
    const response = await this.client.put(`/workspaces/${workspaceId}/members/${userId}/role`, { roleKey });
    return response.data;
  }

  // Board endpoints
  async getBoards(options?: {
    workspaceId?: string;
    view?: 'summary' | 'detail';
    fields?: readonly string[];
    /** Avoid stale cached GET responses when re-reading order after a reorder. */
    cacheBust?: boolean;
    skip?: number;
    limit?: number;
  }): Promise<{ boards: unknown[]; hasMore?: boolean }> {
    const params = new URLSearchParams();
    if (options?.workspaceId !== undefined) {
      params.set('workspaceId', options.workspaceId);
    }
    if (options?.view !== undefined) {
      params.set('view', options.view);
    }
    if (Array.isArray(options?.fields) && options.fields.length > 0) {
      params.set('fields', options.fields.join(','));
    }
    if (options?.skip !== undefined) {
      params.set('skip', String(options.skip));
    }
    if (options?.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options?.cacheBust === true) {
      params.set('_', String(Date.now()));
    }
    const suffix = params.toString();
    const response = await this.client.get(`/boards${suffix === '' ? '' : `?${suffix}`}`);
    return response.data as { boards: unknown[]; hasMore?: boolean };
  }

  async getBoardsByWorkspace(
    workspaceId: string,
    options?: { view?: 'summary' | 'detail'; skip?: number; limit?: number }
  ): Promise<{ boards: unknown[]; hasMore?: boolean }> {
    const params = new URLSearchParams();
    if (options?.view !== undefined) {
      params.set('view', options.view);
    }
    if (options?.skip !== undefined) {
      params.set('skip', String(options.skip));
    }
    if (options?.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    const suffix = params.toString();
    const response = await this.client.get(
      `/boards/workspace/${workspaceId}${suffix === '' ? '' : `?${suffix}`}`
    );
    return response.data as { boards: unknown[]; hasMore?: boolean };
  }

  async getBoard(
    id: string,
    requestConfig?: { signal?: AbortSignal; view?: 'summary' | 'detail' }
  ): Promise<{ board: unknown }> {
    const params = new URLSearchParams();
    if (requestConfig?.view !== undefined) {
      params.set('view', requestConfig.view);
    }
    const qs = params.toString();
    const response = await this.client.get(
      `/boards/${id}${qs === '' ? '' : `?${qs}`}`,
      requestConfig?.signal !== undefined ? { signal: requestConfig.signal } : undefined,
    );
    return response.data;
  }

  async getMyBoardPermissions(boardId: string): Promise<{ boardId: string; permissions: string[]; serverTs: number }> {
    const response = await this.client.get(`/boards/${boardId}/permissions/me`);
    return response.data as { boardId: string; permissions: string[]; serverTs: number };
  }

  async getMyWorkspacePermissions(
    workspaceId: string,
  ): Promise<{ workspaceId: string; permissions: string[]; serverTs: number }> {
    const response = await this.client.get(`/workspaces/${workspaceId}/permissions/me`);
    return response.data as { workspaceId: string; permissions: string[]; serverTs: number };
  }

  async getWorkspaceMemberCandidates(
    workspaceId: string,
    options?: { limit?: number; cursor?: string; signal?: AbortSignal },
  ): Promise<{ users: unknown[]; nextCursor?: string }> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options?.cursor !== undefined && options.cursor !== '') {
      params.set('cursor', options.cursor);
    }
    const qs = params.toString();
    const response = await this.client.get(
      `/workspaces/${workspaceId}/member-candidates${qs === '' ? '' : `?${qs}`}`,
      options?.signal !== undefined ? { signal: options.signal } : undefined,
    );
    return response.data as { users: unknown[]; nextCursor?: string };
  }

  async getWorkspaceAssignableRoles(workspaceId: string): Promise<{
    roles: Array<{ key: string; displayName: string; isBuiltIn: boolean }>;
  }> {
    const response = await this.client.get(`/workspaces/${workspaceId}/roles`);
    return response.data as {
      roles: Array<{ key: string; displayName: string; isBuiltIn: boolean }>;
    };
  }

  async createBoard(data: {
    workspaceId: string;
    name: string;
    description?: string;
    background?: string;
    visibility?: 'private' | 'workspace' | 'public';
  }): Promise<{ board: unknown }> {
    const response = await this.client.post('/boards', data);
    return response.data;
  }

  async updateBoard(id: string, data: {
    name?: string;
    description?: string;
    background?: string;
    visibility?: 'private' | 'workspace' | 'public';
    workspaceId?: string | null;
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
      memberActivityLogRetentionDays?: number | null;
    };
  }): Promise<{ board: unknown }> {
    const response = await this.client.put(`/boards/${id}`, data);
    return response.data;
  }

  async reorderHomeBoards(payload: {
    workspaceId: string;
    orderedBoardIds: readonly string[];
  }): Promise<{ message: string }> {
    const response = await this.client.put('/boards/reorder', payload);
    return response.data;
  }

  async deleteBoard(id: string): Promise<void> {
    await this.client.delete(`/boards/${id}`);
  }

  async addBoardMember(boardId: string, userId: string, roleKey: string): Promise<{ board: unknown }> {
    const response = await this.client.post(`/boards/${boardId}/members`, { userId, roleKey });
    return response.data;
  }

  async removeBoardMember(boardId: string, userId: string): Promise<void> {
    await this.client.delete(`/boards/${boardId}/members/${userId}`);
  }

  async updateBoardMemberRole(
    boardId: string,
    userId: string,
    roleKey: string
  ): Promise<{ board: unknown }> {
    const response = await this.client.put(`/boards/${boardId}/members/${userId}/role`, { roleKey });
    return response.data;
  }

  async getBoardAssignableRoles(boardId: string): Promise<{
    roles: Array<{ key: string; displayName: string; isBuiltIn: boolean }>;
  }> {
    const response = await this.client.get(`/boards/${boardId}/roles`);
    return response.data;
  }

  async getBoardMembers(
    boardId: string,
    options?: {
      q?: string;
      sort?: 'displayName:asc' | 'displayName:desc' | 'email:asc' | 'email:desc';
      cursor?: string;
      limit?: number;
    }
  ): Promise<{ members: unknown[]; nextCursor?: string }> {
    const params = new URLSearchParams();
    if (options?.q !== undefined && options.q !== '') {
      params.set('q', options.q);
    }
    if (options?.sort !== undefined) {
      params.set('sort', options.sort);
    }
    if (options?.cursor !== undefined && options.cursor !== '') {
      params.set('cursor', options.cursor);
    }
    if (options?.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    const suffix = params.toString();
    const response = await this.client.get(
      `/boards/${boardId}/members${suffix === '' ? '' : `?${suffix}`}`
    );
    return response.data;
  }

  async searchUsers(
    query: string,
    options?: {
      readonly boardId?: string;
      readonly workspaceId?: string;
      /** App Admins only: full paginated directory; excludes current App Admins from results. */
      readonly appAdminDirectory?: boolean;
      readonly limit?: number;
      readonly cursor?: string;
      readonly signal?: AbortSignal;
    }
  ): Promise<{ users: unknown[]; nextCursor?: string }> {
    const params = new URLSearchParams();
    params.set('q', query);
    if (options?.boardId !== undefined && options.boardId !== '') {
      params.set('boardId', options.boardId);
    }
    if (options?.workspaceId !== undefined && options.workspaceId !== '') {
      params.set('workspaceId', options.workspaceId);
    }
    if (options?.appAdminDirectory === true) {
      params.set('appAdminDirectory', '1');
    }
    if (options?.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options?.cursor !== undefined && options.cursor !== '') {
      params.set('cursor', options.cursor);
    }
    const requestConfig =
      options?.signal !== undefined ? { signal: options.signal } : undefined;
    const response = await this.client.get(`/users/search?${params.toString()}`, requestConfig);
    return response.data;
  }

  // List endpoints
  async getListsByBoard(boardId: string): Promise<{ lists: unknown[] }> {
    const response = await this.client.get(`/lists/board/${boardId}`);
    return response.data;
  }

  async getList(id: string): Promise<{ list: unknown }> {
    const response = await this.client.get(`/lists/${id}`);
    return response.data;
  }

  async createList(data: {
    boardId: string;
    name: string;
    position?: number;
  }): Promise<{ list: unknown }> {
    const response = await this.client.post('/lists', data);
    return response.data;
  }

  async updateList(id: string, data: {
    name?: string;
    position?: number;
    color?: string;
  }): Promise<{ list: unknown }> {
    const response = await this.client.put(`/lists/${id}`, data);
    return response.data;
  }

  async deleteList(id: string): Promise<{ listId: string; removed: boolean; message: string }> {
    const response = await this.client.delete<{ listId: string; removed: boolean; message: string }>(
      `/lists/${id}`,
    );
    return response.data;
  }

  async reorderLists(data: {
    boardId: string;
    listIds: string[];
  }): Promise<{ message: string; boardId: string; orderedListIds: string[] }> {
    const response = await this.client.post<{ message: string; boardId: string; orderedListIds: string[] }>(
      '/lists/reorder',
      data,
    );
    return response.data;
  }

  // Card endpoints
  async getCardsByList(
    listId: string,
    options?: { view?: 'summary' | 'detail'; fields?: readonly string[] }
  ): Promise<{ cards: unknown[] }> {
    const params = new URLSearchParams();
    if (options?.view !== undefined) {
      params.set('view', options.view);
    }
    if (Array.isArray(options?.fields) && options.fields.length > 0) {
      params.set('fields', options.fields.join(','));
    }
    const suffix = params.toString();
    const response = await this.client.get(`/cards/list/${listId}${suffix === '' ? '' : `?${suffix}`}`);
    return response.data;
  }

  async getBoardKanbanSnapshot(
    boardId: string,
    options?: { listLimit?: number }
  ): Promise<{ board: unknown; lists: unknown[]; cardsByList: Record<string, unknown[]> }> {
    const params = new URLSearchParams();
    if (typeof options?.listLimit === 'number') {
      params.set('listLimit', String(options.listLimit));
    }
    const suffix = params.toString();
    const response = await this.client.get(
      `/boards/${boardId}/kanban-snapshot${suffix === '' ? '' : `?${suffix}`}`
    );
    return response.data;
  }

  async postBoardCardDescriptionsBatch(
    boardId: string,
    cardIds: readonly string[],
  ): Promise<{
    cards: ReadonlyArray<{ id: string; description: string; descriptionHtml?: string }>;
  }> {
    const response = await this.client.post(`/boards/${boardId}/cards/descriptions-batch`, {
      cardIds: [...cardIds],
    });
    const data = response.data;
    if (data == null || typeof data !== 'object' || !('cards' in data)) {
      return { cards: [] };
    }
    const cards = (data as { cards: unknown }).cards;
    if (!Array.isArray(cards)) {
      return { cards: [] };
    }
    return { cards: cards as ReadonlyArray<{ id: string; description: string; descriptionHtml?: string }> };
  }

  async patchBoardListsBulkColor(
    boardId: string,
    body: { color: string },
  ): Promise<{ updatedCount: number }> {
    const response = await this.client.patch(`/boards/${boardId}/lists/bulk-color`, body);
    return response.data as { updatedCount: number };
  }

  async patchBoardCardsBulkColor(
    boardId: string,
    body: { color: string; listId?: string },
  ): Promise<{ updatedCount: number }> {
    const response = await this.client.patch(`/boards/${boardId}/cards/bulk-color`, body);
    return response.data as { updatedCount: number };
  }

  async getCard(id: string): Promise<{ card: unknown }> {
    const response = await this.client.get(`/cards/${id}`);
    return response.data;
  }

  async createCard(data: {
    listId: string;
    boardId: string;
    title: string;
    description?: string;
    position?: number;
  }): Promise<{ card: unknown }> {
    const response = await this.client.post('/cards', data);
    return response.data;
  }

  async updateCard(id: string, data: {
    title?: string;
    description?: string;
    listId?: string;
    position?: number;
    color?: string;
    cover?: string;
    dueDate?: string | null;
    startDate?: string;
    completed?: boolean;
  }): Promise<{ card: unknown }> {
    const response = await this.client.put(`/cards/${id}`, data);
    return response.data;
  }

  async deleteCard(id: string): Promise<{ cardId: string; removed: boolean; message: string }> {
    const response = await this.client.delete<{ cardId: string; removed: boolean; message: string }>(
      `/cards/${id}`,
    );
    return response.data;
  }

  async moveCard(cardId: string, listId: string, position: number): Promise<{ card: unknown }> {
    const response = await this.client.put(`/cards/${cardId}/move`, { listId, position });
    return response.data;
  }

  async reorderCards(
    listId: string,
    cardIds: string[],
  ): Promise<{ message: string; listId: string; orderedCardIds: string[] }> {
    const response = await this.client.put<{ message: string; listId: string; orderedCardIds: string[] }>(
      '/cards/reorder',
      { listId, cardIds },
    );
    return response.data;
  }

  async duplicateCard(id: string, targetListId: string): Promise<{ card: unknown }> {
    const response = await this.client.post(`/cards/${id}/duplicate`, { targetListId });
    return response.data;
  }

  // Label endpoints
  async getBoardLabels(boardId: string): Promise<{ labels: unknown[] }> {
    const response = await this.client.get(`/boards/${boardId}/labels`);
    return response.data;
  }

  async createLabel(boardId: string, data: {
    name: string;
    color: string;
  }): Promise<{ label: unknown }> {
    const response = await this.client.post(`/boards/${boardId}/labels`, data);
    return response.data;
  }

  async updateLabel(boardId: string, labelId: string, data: {
    name?: string;
    color?: string;
  }): Promise<{ label: unknown }> {
    const response = await this.client.put(`/boards/${boardId}/labels/${labelId}`, data);
    return response.data;
  }

  async deleteLabel(boardId: string, labelId: string): Promise<void> {
    await this.client.delete(`/boards/${boardId}/labels/${labelId}`);
  }

  async assignLabelToCard(cardId: string, labelId: string): Promise<{ card: unknown }> {
    const response = await this.client.post(`/cards/${cardId}/labels/${labelId}`);
    return response.data;
  }

  async removeLabelFromCard(cardId: string, labelId: string): Promise<{ card: unknown }> {
    const response = await this.client.delete(`/cards/${cardId}/labels/${labelId}`);
    return response.data;
  }

  // Card assignee endpoints
  async addCardAssignee(cardId: string, userId: string): Promise<{ card: unknown }> {
    const response = await this.client.post(`/cards/${cardId}/assignees`, { userId });
    return response.data;
  }

  async removeCardAssignee(cardId: string, userId: string): Promise<{ card: unknown }> {
    const response = await this.client.delete(`/cards/${cardId}/assignees/${userId}`);
    return response.data;
  }

  // Checklist endpoints
  async createChecklist(data: {
    cardId: string;
    title: string;
  }): Promise<{ card: unknown }> {
    const response = await this.client.post('/checklists', data);
    return response.data;
  }

  async updateChecklist(checklistId: string, data: {
    cardId: string;
    title?: string;
  }): Promise<{ card: unknown }> {
    const response = await this.client.put(`/checklists/${checklistId}`, data);
    return response.data;
  }

  async deleteChecklist(checklistId: string, cardId: string): Promise<void> {
    await this.client.delete(`/checklists/${checklistId}`, { data: { cardId } });
  }

  async createChecklistItem(data: {
    cardId: string;
    checklistId: string;
    text: string;
    sortOrder?: number;
  }): Promise<{ card: unknown }> {
    const response = await this.client.post('/checklists/items', data);
    return response.data;
  }

  async updateChecklistItem(itemId: string, data: {
    cardId: string;
    checklistId: string;
    text?: string;
    completed?: boolean;
    sortOrder?: number;
  }): Promise<{ card: unknown }> {
    const response = await this.client.put(`/checklists/items/${itemId}`, data);
    return response.data;
  }

  async deleteChecklistItem(itemId: string, data: {
    cardId: string;
    checklistId: string;
  }): Promise<void> {
    await this.client.delete(`/checklists/items/${itemId}`, { data });
  }

  // Comment endpoints
  async createComment(data: {
    cardId: string;
    text: string;
  }): Promise<{ card: unknown }> {
    const response = await this.client.post('/comments', data);
    return response.data;
  }

  async updateComment(commentId: string, data: {
    cardId: string;
    text: string;
  }): Promise<{ card: unknown }> {
    const response = await this.client.put(`/comments/${commentId}`, data);
    return response.data;
  }

  async deleteComment(commentId: string, cardId: string): Promise<void> {
    await this.client.delete(`/comments/${commentId}`, { data: { cardId } });
  }

  // Activity endpoints
  async getBoardActivities(
    boardId: string,
    options?: {
      limit?: number;
      type?: string;
      search?: string;
      cardId?: string;
      cursor?: string;
      memberAudit?: boolean;
      page?: number;
      pageSize?: number;
    }
  ): Promise<
    | { activities: unknown[]; nextCursor?: string }
    | { activities: unknown[]; total: number; page: number; pageSize: number }
  > {
    const params = new URLSearchParams();
    const o = options ?? {};
    if (o.limit !== undefined) params.append('limit', o.limit.toString());
    if (o.type !== undefined && o.type !== '') params.append('type', o.type);
    if (o.search !== undefined && o.search !== '') params.append('search', o.search);
    if (o.cardId !== undefined && o.cardId !== '') params.append('cardId', o.cardId);
    if (o.cursor !== undefined && o.cursor !== '') params.append('cursor', o.cursor);
    if (o.memberAudit === true) params.append('memberAudit', 'true');
    if (o.page !== undefined) params.append('page', o.page.toString());
    if (o.pageSize !== undefined) params.append('pageSize', o.pageSize.toString());
    const response = await this.client.get(`/activities/boards/${boardId}?${params.toString()}`);
    return response.data;
  }

  async getCardActivities(
    cardId: string,
    limit?: number,
    search?: string,
    cursor?: string
  ): Promise<{ activities: unknown[]; nextCursor?: string }> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (search) params.append('search', search);
    if (cursor) params.append('cursor', cursor);
    const response = await this.client.get(`/activities/cards/${cardId}?${params.toString()}`);
    return response.data;
  }

  // Invite endpoints
  async createInvite(data: {
    workspaceId?: string;
    boardId?: string;
    type: 'workspace' | 'board';
    inviteType: 'one-time' | 'recurring';
    role?: 'admin' | 'manager' | 'viewer';
    roleKey?: string;
  }): Promise<{ inviteLink: unknown }> {
    const response = await this.client.post('/invites', data);
    return response.data;
  }

  async getInvites(workspaceId?: string, boardId?: string): Promise<{ inviteLinks: unknown[] }> {
    const params = new URLSearchParams();
    if (workspaceId) params.append('workspaceId', workspaceId);
    if (boardId) params.append('boardId', boardId);
    const response = await this.client.get(`/invites?${params.toString()}`);
    return response.data;
  }

  async deleteInvite(inviteId: string): Promise<void> {
    await this.client.delete(`/invites/${inviteId}`);
  }

  async acceptInvite(token: string): Promise<{ message: string }> {
    const response = await this.client.post(`/invites/accept/${token}`);
    return response.data;
  }

  // Admin endpoints
  async getPlaceholderUsers(): Promise<{ users: unknown[] }> {
    const response = await this.client.get('/admin/users/placeholders');
    return response.data;
  }

  async convertPlaceholderUser(userId: string): Promise<{ message: string; user: unknown }> {
    const response = await this.client.post(`/admin/users/${userId}/convert-from-placeholder`);
    return response.data;
  }

  async mergePlaceholderUser(placeholderId: string, userId: string): Promise<{ message: string; user: unknown }> {
    const response = await this.client.post(`/admin/users/${placeholderId}/merge/${userId}`);
    return response.data;
  }

  async getPermissionSets(): Promise<{ permissionSets: unknown[] }> {
    const response = await this.client.get('/admin/permission-sets');
    return response.data;
  }

  async createPermissionSet(data: {
    name: string;
    description?: string;
    permissions: string[];
  }): Promise<{ permissionSet: unknown }> {
    const response = await this.client.post('/admin/permission-sets', data);
    return response.data;
  }

  async getRoles(): Promise<{ roles: unknown[] }> {
    const response = await this.client.get('/admin/roles');
    return response.data;
  }

  async createRole(data: {
    key: string;
    displayName: string;
    description?: string;
    permissions: string[];
  }): Promise<{ role: unknown }> {
    const response = await this.client.post('/admin/roles', data);
    return response.data;
  }

  async updateRole(roleKey: string, patch: {
    displayName?: string;
    description?: string;
    permissions?: string[];
  }): Promise<{ role: unknown }> {
    const response = await this.client.put(`/admin/roles/${encodeURIComponent(roleKey)}`, patch);
    return response.data;
  }

  async deleteRole(roleKey: string): Promise<void> {
    await this.client.delete(`/admin/roles/${encodeURIComponent(roleKey)}`);
  }

  async getAppAdmins(): Promise<{
    appAdmins: Array<{ _id: string; displayName: string; email: string }>;
    bootstrapAppAdminId: string | null;
  }> {
    const response = await this.client.get('/admin/app-admins');
    return response.data;
  }

  async addAppAdmin(userId: string): Promise<{ appAdmin: { _id: string; displayName: string; email: string } }> {
    const response = await this.client.post('/admin/app-admins', { userId });
    return response.data;
  }

  async removeAppAdmin(userId: string): Promise<void> {
    await this.client.delete(`/admin/app-admins/${encodeURIComponent(userId)}`);
  }

  // User preferences endpoints
  async updateUserProfile(data: { displayName?: string }): Promise<{ user: unknown }> {
    const response = await this.client.put('/users/me', data);
    return response.data;
  }

  async uploadProfilePicture(
    blob: Blob,
    filename: string,
    mimeType: string
  ): Promise<{ user: unknown }> {
    const form = new FormData();
    form.append('file', new File([blob], filename, { type: mimeType }));
    const response = await this.client.post<{ user: unknown }>('/users/me/profile-picture', form, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async deleteProfilePicture(): Promise<{ user: unknown }> {
    const response = await this.client.delete<{ user: unknown }>('/users/me/profile-picture');
    return response.data;
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<{ message: string }> {
    const response = await this.client.put('/users/me/password', { oldPassword, newPassword });
    return response.data;
  }

  async updateUserPreferences(preferences: {
    language?: string;
    homeWorkspaceOrder?: readonly string[];
  }): Promise<{ user: unknown }> {
    const response = await this.client.put('/users/me/preferences', preferences);
    return response.data;
  }

  async getUserPreferences(): Promise<{ preferences: unknown }> {
    const response = await this.client.get('/users/me/preferences');
    return response.data;
  }

  // Push subscription endpoints
  async getVapidPublicKey(): Promise<{ publicKey: string }> {
    const response = await this.client.get('/users/vapid-public-key');
    return response.data;
  }

  async subscribeToPush(subscription: PushSubscriptionJSON): Promise<{ message: string }> {
    const response = await this.client.post('/users/me/push-subscription', { subscription });
    return response.data;
  }

  async unsubscribeFromPush(): Promise<{ message: string }> {
    const response = await this.client.delete('/users/me/push-subscription');
    return response.data;
  }

  // Card reminder endpoints
  async addCardReminder(cardId: string, data: {
    triggerAt: string;
    repeatFrequency?: string;
  }): Promise<{ card: unknown }> {
    const response = await this.client.post(`/cards/${cardId}/reminders`, data);
    return response.data;
  }

  async updateCardReminder(cardId: string, reminderId: string, data: {
    triggerAt?: string;
    repeatFrequency?: string;
  }): Promise<{ card: unknown }> {
    const response = await this.client.put(`/cards/${cardId}/reminders/${reminderId}`, data);
    return response.data;
  }

  async deleteCardReminder(cardId: string, reminderId: string): Promise<{ card: unknown }> {
    const response = await this.client.delete(`/cards/${cardId}/reminders/${reminderId}`);
    return response.data;
  }

  async dismissCardReminder(cardId: string, reminderId: string): Promise<{ card: unknown }> {
    const response = await this.client.put(`/cards/${cardId}/reminders/${reminderId}/dismiss`);
    return response.data;
  }

  // Import endpoints
  async importTrello(
    file: File,
    workspaceId?: string,
    defaultUncolouredCardColour?: string,
    preflight?: ImportPreflightPayload,
  ): Promise<{ message: string; jobId: string }> {
    const formData = new FormData();
    formData.append('file', file);
    if (workspaceId) {
      formData.append('workspaceId', workspaceId);
    }
    if (defaultUncolouredCardColour) {
      formData.append('defaultUncolouredCardColour', defaultUncolouredCardColour);
    }
    if (preflight !== undefined) {
      formData.append('preflight', JSON.stringify(preflight));
    }
    const response = await this.client.post('/import/trello', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async importWekan(
    file: File,
    defaultUncolouredCardColour?: string,
    preflight?: ImportPreflightPayload,
  ): Promise<{ message: string; jobId: string }> {
    const formData = new FormData();
    formData.append('file', file);
    if (defaultUncolouredCardColour) {
      formData.append('defaultUncolouredCardColour', defaultUncolouredCardColour);
    }
    if (preflight !== undefined) {
      formData.append('preflight', JSON.stringify(preflight));
    }
    const response = await this.client.post('/import/wekan', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async importCSV(
    file: File,
    boardId: string,
    delimiter?: ',' | '\t',
    defaultUncolouredCardColour?: string,
  ): Promise<{ message: string; jobId: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('boardId', boardId);
    if (delimiter) {
      formData.append('delimiter', delimiter);
    }
    if (defaultUncolouredCardColour) {
      formData.append('defaultUncolouredCardColour', defaultUncolouredCardColour);
    }
    const response = await this.client.post('/import/csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async getImportJobStatus(jobId: string): Promise<{ job: unknown }> {
    const response = await this.client.get(`/import/jobs/${jobId}`);
    return response.data;
  }

  // Export endpoints
  async exportBoardAsJSON(boardId: string): Promise<void> {
    const response = await this.client.get(`/export/boards/${boardId}/json`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `board-${boardId}.json`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  async exportBoardAsCSV(boardId: string, columns?: string[]): Promise<void> {
    const params = columns && columns.length > 0 ? `?columns=${columns.join(',')}` : '';
    const response = await this.client.get(`/export/boards/${boardId}/csv${params}`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `board-${boardId}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  // Attachment endpoints
  async uploadCardAttachment(
    cardId: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<{ attachment: unknown }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.client.post(`/cards/${cardId}/attachments`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });
    return response.data;
  }

  async deleteCardAttachment(cardId: string, attachmentId: string): Promise<void> {
    await this.client.delete(`/cards/${cardId}/attachments/${attachmentId}`);
  }

  async getAttachmentUrl(attachmentId: string): Promise<{ url: string }> {
    const response = await this.client.get(`/attachments/${attachmentId}/url`);
    return response.data;
  }

  getAttachmentFileUrl(attachmentId: string): string {
    const safeId = encodeURIComponent(attachmentId);
    const token = this.getToken();
    if (token && token.trim() !== '') {
      return `${API_BASE_URL}/attachments/${safeId}/file?token=${encodeURIComponent(token)}`;
    }
    return `${API_BASE_URL}/attachments/${safeId}/file`;
  }

  // Admin endpoints
  async getAdminConfig(): Promise<{ config: unknown }> {
    const response = await this.client.get('/admin/config');
    return response.data;
  }

  async updateAdminConfig(config: unknown): Promise<{ config: unknown }> {
    const response = await this.client.put('/admin/config', config);
    return response.data;
  }

  async testExternalMysqlConnection(
    body:
      | { useSavedCredentials: true }
      | {
          host: string;
          port?: number;
          database: string;
          username: string;
          password?: string;
          verificationQuery?: string;
        }
  ): Promise<{ ok: boolean; message: string }> {
    const response = await this.client.post<{ ok: boolean; message: string }>(
      '/admin/config/test-external-mysql',
      body
    );
    return response.data;
  }

  async unlockUser(userId: string): Promise<{ message: string }> {
    const response = await this.client.post(`/admin/users/${userId}/unlock`);
    return response.data;
  }

  async getAdminUsers(options?: {
    readonly q?: string;
    readonly limit?: number;
    readonly cursor?: string;
  }): Promise<{
    users: Array<{
      _id: string;
      displayName: string;
      email: string;
      username: string;
      isAppAdmin: boolean;
      createdAt: string;
      lastLogin?: string;
      emailVerified: boolean;
      failedLoginAttempts: number;
      authProvider: 'password' | 'google' | 'google+password' | 'none';
    }>;
    nextCursor?: string;
  }> {
    const params = new URLSearchParams();
    if (options?.q !== undefined && options.q.trim() !== '') {
      params.set('q', options.q.trim());
    }
    if (options?.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options?.cursor !== undefined && options.cursor.trim() !== '') {
      params.set('cursor', options.cursor.trim());
    }
    const response = await this.client.get(`/admin/users?${params.toString()}`);
    return response.data as {
      users: Array<{
        _id: string;
        displayName: string;
        email: string;
        username: string;
        isAppAdmin: boolean;
        createdAt: string;
        lastLogin?: string;
        emailVerified: boolean;
        failedLoginAttempts: number;
        authProvider: 'password' | 'google' | 'google+password' | 'none';
      }>;
      nextCursor?: string;
    };
  }

  async deleteAdminUser(userId: string): Promise<void> {
    await this.client.delete(`/admin/users/${encodeURIComponent(userId)}`);
  }

  async getFontsCatalog(): Promise<{ fonts: PublicCustomFontEntry[] }> {
    if (!fontsCatalogCache) {
      fontsCatalogCache = this.client
        .get<{ fonts: PublicCustomFontEntry[] }>('/fonts')
        .then((r) => r.data)
        .catch((e: unknown) => {
          fontsCatalogCache = null;
          throw e;
        });
    }
    return fontsCatalogCache;
  }

  async uploadCustomFont(
    file: File,
    displayName: string
  ): Promise<{ font: PublicCustomFontEntry }> {
    const form = new FormData();
    form.append('file', file);
    form.append('displayName', displayName);
    const response = await this.client.post<{ font: PublicCustomFontEntry }>(
      '/admin/fonts/upload',
      form,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    invalidateFontsCatalogCache();
    return response.data;
  }

  async deleteCustomFontFile(fileName: string): Promise<void> {
    await this.client.delete(`/admin/fonts/${encodeURIComponent(fileName)}`);
    invalidateFontsCatalogCache();
  }
}

export const api = new ApiClient();
