import type { BoardThemeDefinition } from '../../../shared/boardTheme.js';
import { PRIVACY_POLICY_VERSION } from '../../../shared/legal/privacyPolicy.js';
import { parseClientAuthUser } from './authApiMethods.js';
import type { ApiClient } from '../api.js';

export interface UserApiMethods {
  searchUsers(
    query: string,
    options?: {
      readonly boardId?: string;
      readonly workspaceId?: string;
      readonly appAdminDirectory?: boolean;
      readonly limit?: number;
      readonly cursor?: string;
      readonly signal?: AbortSignal;
    }
  ): Promise<{ users: unknown[]; nextCursor?: string }>;
  updateUserProfile(data: { displayName?: string }): Promise<{ user: unknown }>;
  uploadProfilePicture(blob: Blob, filename: string, mimeType: string): Promise<{ user: unknown }>;
  deleteProfilePicture(): Promise<{ user: unknown }>;
  changePassword(oldPassword: string, newPassword: string): Promise<{ message: string }>;
  updateUserPreferences(preferences: {
    language?: string;
    homeWorkspaceOrder?: readonly string[];
    homeBoardOrderPatch?: {
      readonly workspaceId: string;
      readonly orderedBoardIds: readonly string[];
    };
    customBoardThemes?: readonly BoardThemeDefinition[];
  }): Promise<{ user: unknown }>;
  getUserPreferences(): Promise<{
    preferences: {
      language?: string;
      homeWorkspaceOrder?: string[];
      homeBoardOrderByWorkspace?: Record<string, string[]>;
      customBoardThemes?: BoardThemeDefinition[];
    };
  }>;
  getVapidPublicKey(): Promise<{ publicKey: string }>;
  subscribeToPush(subscription: PushSubscriptionJSON): Promise<{ message: string }>;
  unsubscribeFromPush(): Promise<{ message: string }>;
  getMyHomeCapabilities(): Promise<{
    capabilities: {
      'workspaces.create': boolean;
      'import.display': boolean;
    };
    serverTs: number;
  }>;
  acceptPrivacyPolicy(): Promise<{ user: unknown }>;
}

export const userApiMethods: UserApiMethods = {
  async searchUsers(this: ApiClient, query, options) {
    const params = new URLSearchParams();
    params.set('q', query);
    if (options?.boardId !== undefined && options.boardId !== '') params.set('boardId', options.boardId);
    if (options?.workspaceId !== undefined && options.workspaceId !== '') params.set('workspaceId', options.workspaceId);
    if (options?.appAdminDirectory === true) params.set('appAdminDirectory', '1');
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.cursor !== undefined && options.cursor !== '') params.set('cursor', options.cursor);
    const requestConfig = options?.signal !== undefined ? { signal: options.signal } : undefined;
    const response = await this.client.get(`/users/search?${params.toString()}`, requestConfig);
    return response.data as { users: unknown[]; nextCursor?: string };
  },

  async updateUserProfile(this: ApiClient, data) {
    const response = await this.client.put('/users/me', data);
    return response.data as { user: unknown };
  },

  async uploadProfilePicture(this: ApiClient, blob, filename, mimeType) {
    const form = new FormData();
    form.append('file', new File([blob], filename, { type: mimeType }));
    const response = await this.client.post<{ user: unknown }>('/users/me/profile-picture', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async deleteProfilePicture(this: ApiClient) {
    const response = await this.client.delete<{ user: unknown }>('/users/me/profile-picture');
    return response.data;
  },

  async changePassword(this: ApiClient, oldPassword, newPassword) {
    const response = await this.client.put('/users/me/password', { oldPassword, newPassword });
    return response.data as { message: string };
  },

  async updateUserPreferences(this: ApiClient, preferences) {
    const response = await this.client.put('/users/me/preferences', preferences);
    return response.data as { user: unknown };
  },

  async getUserPreferences(this: ApiClient) {
    const response = await this.client.get('/users/me/preferences');
    return response.data as {
      preferences: {
        language?: string;
        homeWorkspaceOrder?: string[];
        homeBoardOrderByWorkspace?: Record<string, string[]>;
        customBoardThemes?: BoardThemeDefinition[];
      };
    };
  },

  async getVapidPublicKey(this: ApiClient) {
    const response = await this.client.get('/users/vapid-public-key');
    return response.data as { publicKey: string };
  },

  async subscribeToPush(this: ApiClient, subscription) {
    const response = await this.client.post('/users/me/push-subscription', { subscription });
    return response.data as { message: string };
  },

  async unsubscribeFromPush(this: ApiClient) {
    const response = await this.client.delete('/users/me/push-subscription');
    return response.data as { message: string };
  },

  async getMyHomeCapabilities(this: ApiClient) {
    const response = await this.client.get('/users/me/home-capabilities');
    return response.data as {
      capabilities: {
        'workspaces.create': boolean;
        'import.display': boolean;
      };
      serverTs: number;
    };
  },

  async acceptPrivacyPolicy(this: ApiClient) {
    const response = await this.client.post('/users/me/privacy-policy-acceptance', {
      version: PRIVACY_POLICY_VERSION,
    });
    const data = response.data as { user?: unknown };
    if (data.user == null) {
      throw new Error('Privacy policy acceptance response missing user');
    }
    parseClientAuthUser(data.user);
    return { user: data.user };
  },
};
