import type { ApiClient } from '../api.js';

export interface CommentApiMethods {
  createComment(data: { cardId: string; text: string }): Promise<{ card: unknown }>;
  updateComment(commentId: string, data: { cardId: string; text: string }): Promise<{ card: unknown }>;
  deleteComment(commentId: string, cardId: string): Promise<void>;
}

export const commentApiMethods: CommentApiMethods = {
  async createComment(this: ApiClient, data) {
    const response = await this.client.post('/comments', data);
    return response.data as { card: unknown };
  },

  async updateComment(this: ApiClient, commentId, data) {
    const response = await this.client.put(`/comments/${commentId}`, data);
    return response.data as { card: unknown };
  },

  async deleteComment(this: ApiClient, commentId, cardId) {
    await this.client.delete(`/comments/${commentId}`, { data: { cardId } });
  },
};
