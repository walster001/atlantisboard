import type { ApiClient } from '../api.js';

export interface WorkspaceApiMethods {
  getWorkspaces(options?: {
    view?: 'summary' | 'detail';
    fields?: readonly string[];
  }): Promise<{ workspaces: unknown[] }>;
  getWorkspace(
    id: string,
    requestConfig?: { signal?: AbortSignal; view?: 'summary' | 'detail' }
  ): Promise<{ workspace: unknown }>;
  createWorkspace(data: { name: string; description?: string }): Promise<{ workspace: unknown }>;
  updateWorkspace(id: string, data: { name?: string; description?: string }): Promise<{ workspace: unknown }>;
  deleteWorkspace(id: string): Promise<void>;
  addWorkspaceMember(workspaceId: string, userId: string, roleKey: string): Promise<{ workspace: unknown }>;
  removeWorkspaceMember(workspaceId: string, userId: string): Promise<{ workspace: unknown }>;
  updateWorkspaceMemberRole(workspaceId: string, userId: string, roleKey: string): Promise<{ workspace: unknown }>;
  getMyWorkspacePermissions(
    workspaceId: string,
  ): Promise<{ workspaceId: string; permissions: string[]; serverTs: number }>;
  getWorkspaceMemberCandidates(
    workspaceId: string,
    options?: { limit?: number; cursor?: string; signal?: AbortSignal },
  ): Promise<{ users: unknown[]; nextCursor?: string }>;
  getWorkspaceAssignableRoles(workspaceId: string): Promise<{
    roles: Array<{ key: string; displayName: string; isBuiltIn: boolean }>;
  }>;
}

export const workspaceApiMethods: WorkspaceApiMethods = {
  async getWorkspaces(this: ApiClient, options) {
    const params = new URLSearchParams();
    if (options?.view !== undefined) {
      params.set('view', options.view);
    }
    if (Array.isArray(options?.fields) && options.fields.length > 0) {
      params.set('fields', options.fields.join(','));
    }
    const suffix = params.toString();
    const response = await this.client.get(`/workspaces${suffix === '' ? '' : `?${suffix}`}`);
    return response.data as { workspaces: unknown[] };
  },

  async getWorkspace(this: ApiClient, id, requestConfig) {
    const params = new URLSearchParams();
    if (requestConfig?.view !== undefined) {
      params.set('view', requestConfig.view);
    }
    const qs = params.toString();
    const response = await this.client.get(
      `/workspaces/${id}${qs === '' ? '' : `?${qs}`}`,
      requestConfig?.signal !== undefined ? { signal: requestConfig.signal } : undefined,
    );
    return response.data as { workspace: unknown };
  },

  async createWorkspace(this: ApiClient, data) {
    const response = await this.client.post('/workspaces', data);
    return response.data as { workspace: unknown };
  },

  async updateWorkspace(this: ApiClient, id, data) {
    const response = await this.client.put(`/workspaces/${id}`, data);
    return response.data as { workspace: unknown };
  },

  async deleteWorkspace(this: ApiClient, id) {
    await this.client.delete(`/workspaces/${id}`);
  },

  async addWorkspaceMember(this: ApiClient, workspaceId, userId, roleKey) {
    const response = await this.client.post(`/workspaces/${workspaceId}/members`, { userId, roleKey });
    return response.data as { workspace: unknown };
  },

  async removeWorkspaceMember(this: ApiClient, workspaceId, userId) {
    const response = await this.client.delete(`/workspaces/${workspaceId}/members/${userId}`);
    return response.data as { workspace: unknown };
  },

  async updateWorkspaceMemberRole(this: ApiClient, workspaceId, userId, roleKey) {
    const response = await this.client.put(`/workspaces/${workspaceId}/members/${userId}/role`, { roleKey });
    return response.data as { workspace: unknown };
  },

  async getMyWorkspacePermissions(this: ApiClient, workspaceId) {
    const response = await this.client.get(`/workspaces/${workspaceId}/permissions/me`);
    return response.data as { workspaceId: string; permissions: string[]; serverTs: number };
  },

  async getWorkspaceMemberCandidates(this: ApiClient, workspaceId, options) {
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
  },

  async getWorkspaceAssignableRoles(this: ApiClient, workspaceId) {
    const response = await this.client.get(`/workspaces/${workspaceId}/roles`);
    return response.data as {
      roles: Array<{ key: string; displayName: string; isBuiltIn: boolean }>;
    };
  },
};
