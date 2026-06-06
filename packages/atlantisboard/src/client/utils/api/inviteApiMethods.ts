import type { ApiClient } from '../api.js';

export interface InviteApiMethods {
  createInvite(data: {
    workspaceId?: string;
    boardId?: string;
    type: 'workspace' | 'board';
    inviteType: 'one-time' | 'recurring';
    role?: 'admin' | 'manager' | 'viewer';
    roleKey?: string;
  }): Promise<{ inviteLink: unknown }>;
  getInvites(workspaceId?: string, boardId?: string): Promise<{ inviteLinks: unknown[] }>;
  deleteInvite(inviteId: string): Promise<void>;
  acceptInvite(token: string): Promise<{ message: string }>;
}

export const inviteApiMethods: InviteApiMethods = {
  async createInvite(this: ApiClient, data) {
    const response = await this.client.post('/invites', data);
    return response.data as { inviteLink: unknown };
  },

  async getInvites(this: ApiClient, workspaceId, boardId) {
    const params = new URLSearchParams();
    if (workspaceId) params.append('workspaceId', workspaceId);
    if (boardId) params.append('boardId', boardId);
    const response = await this.client.get(`/invites?${params.toString()}`);
    return response.data as { inviteLinks: unknown[] };
  },

  async deleteInvite(this: ApiClient, inviteId) {
    await this.client.delete(`/invites/${inviteId}`);
  },

  async acceptInvite(this: ApiClient, token) {
    const response = await this.client.post(`/invites/accept/${token}`);
    return response.data as { message: string };
  },
};
