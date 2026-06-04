import type { ApiClient } from '../api.js';
import { parseCardApiResponse, type CardApiResponse } from './cardApiMethods.js';

export interface CommentApiMethods {
  createComment(data: { cardId: string; text: string }): Promise<CardApiResponse>;
  updateComment(commentId: string, data: { cardId: string; text: string }): Promise<CardApiResponse>;
  deleteComment(commentId: string, cardId: string): Promise<void>;
}

export const commentApiMethods: CommentApiMethods = {
  async createComment(this: ApiClient, data) {
    const response = await this.client.post('/comments', data);
    return parseCardApiResponse(response.data);
  },

  async updateComment(this: ApiClient, commentId, data) {
    const response = await this.client.put(`/comments/${commentId}`, data);
    return parseCardApiResponse(response.data);
  },

  async deleteComment(this: ApiClient, commentId, cardId) {
    await this.client.delete(`/comments/${commentId}`, { data: { cardId } });
  },
};
