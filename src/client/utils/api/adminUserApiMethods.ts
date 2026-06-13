import type { ApiClient } from '../api.js';

export interface AdminUserApiMethods {
  getPlaceholderUsers(): Promise<{ users: unknown[] }>;
  convertPlaceholderUser(userId: string): Promise<{ message: string; user: unknown }>;
  mergePlaceholderUser(placeholderId: string, userId: string): Promise<{ message: string; user: unknown }>;
  unlockUser(userId: string): Promise<{ message: string }>;
  getAdminUsers(options?: {
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
      authProvider: 'password' | 'google' | 'google+password' | 'none';
      canImportBoards: boolean;
      canCreateWorkspace: boolean;
    }>;
    nextCursor?: string;
  }>;
  updateAdminUserAccountCapabilities(body: {
    readonly updates: ReadonlyArray<{
      readonly userId: string;
      readonly canImportBoards: boolean;
      readonly canCreateWorkspace: boolean;
    }>;
  }): Promise<{ updatedCount: number; affectedUserIds: string[] }>;
  deleteAdminUser(userId: string): Promise<{
    deletedUserId: string;
    stats: {
      removedWorkspaceMemberships: number;
      removedBoardMemberships: number;
      deletedSessions: number;
      deletedNotifications: number;
      deletedImportJobs: number;
      deletedBackupJobs: number;
      deletedPermissionSets: number;
      deletedInvites: number;
      deletedBoardLabels: number;
      deletedActivities: number;
      removedHomeWorkspaceRefs: number;
      removedCardEmbeddedRefs: number;
      reassignedCreatedCards: number;
      deletedUserRecords: number;
    };
  }>;
  getAppAdmins(): Promise<{
    appAdmins: Array<{ _id: string; displayName: string; email: string; profilePicture?: string }>;
    bootstrapAppAdminId: string | null;
  }>;
  addAppAdmin(userId: string): Promise<{
    appAdmin: { _id: string; displayName: string; email: string; profilePicture?: string };
  }>;
  removeAppAdmin(userId: string): Promise<void>;
}

export const adminUserApiMethods: AdminUserApiMethods = {
  async getPlaceholderUsers(this: ApiClient) {
    const response = await this.client.get('/admin/users/placeholders');
    return response.data as { users: unknown[] };
  },

  async convertPlaceholderUser(this: ApiClient, userId) {
    const response = await this.client.post(`/admin/users/${userId}/convert-from-placeholder`);
    return response.data as { message: string; user: unknown };
  },

  async mergePlaceholderUser(this: ApiClient, placeholderId, userId) {
    const response = await this.client.post(`/admin/users/${placeholderId}/merge/${userId}`);
    return response.data as { message: string; user: unknown };
  },

  async unlockUser(this: ApiClient, userId) {
    const response = await this.client.post(`/admin/users/${userId}/unlock`);
    return response.data as { message: string };
  },

  async getAdminUsers(this: ApiClient, options) {
    const params = new URLSearchParams();
    if (options?.q !== undefined && options.q.trim() !== '') params.set('q', options.q.trim());
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.cursor !== undefined && options.cursor.trim() !== '') params.set('cursor', options.cursor.trim());
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
        authProvider: 'password' | 'google' | 'google+password' | 'none';
        canImportBoards: boolean;
        canCreateWorkspace: boolean;
      }>;
      nextCursor?: string;
    };
  },

  async updateAdminUserAccountCapabilities(this: ApiClient, body) {
    const response = await this.client.patch('/admin/users/account-capabilities', body);
    return response.data as { updatedCount: number; affectedUserIds: string[] };
  },

  async deleteAdminUser(this: ApiClient, userId) {
    const response = await this.client.delete(`/admin/users/${encodeURIComponent(userId)}`);
    return response.data as {
      deletedUserId: string;
      stats: {
        removedWorkspaceMemberships: number;
        removedBoardMemberships: number;
        deletedSessions: number;
        deletedNotifications: number;
        deletedImportJobs: number;
        deletedBackupJobs: number;
        deletedPermissionSets: number;
        deletedInvites: number;
        deletedBoardLabels: number;
        deletedActivities: number;
        removedHomeWorkspaceRefs: number;
        removedCardEmbeddedRefs: number;
        reassignedCreatedCards: number;
        deletedUserRecords: number;
      };
    };
  },

  async getAppAdmins(this: ApiClient) {
    const response = await this.client.get('/admin/app-admins');
    return response.data as {
      appAdmins: Array<{ _id: string; displayName: string; email: string }>;
      bootstrapAppAdminId: string | null;
    };
  },

  async addAppAdmin(this: ApiClient, userId) {
    const response = await this.client.post('/admin/app-admins', { userId });
    return response.data as { appAdmin: { _id: string; displayName: string; email: string } };
  },

  async removeAppAdmin(this: ApiClient, userId) {
    await this.client.delete(`/admin/app-admins/${encodeURIComponent(userId)}`);
  },
};
