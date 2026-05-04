import type { ApiClient } from '../api.js';

export interface LabelApiMethods {
  getBoardLabels(boardId: string): Promise<{ labels: unknown[] }>;
  createLabel(boardId: string, data: { name: string; color: string }): Promise<{ label: unknown }>;
  updateLabel(boardId: string, labelId: string, data: { name?: string; color?: string }): Promise<{ label: unknown }>;
  deleteLabel(boardId: string, labelId: string): Promise<void>;
  assignLabelToCard(cardId: string, labelId: string): Promise<{ card: unknown }>;
  removeLabelFromCard(cardId: string, labelId: string): Promise<{ card: unknown }>;
}

export const labelApiMethods: LabelApiMethods = {
  async getBoardLabels(this: ApiClient, boardId) {
    const response = await this.client.get(`/boards/${boardId}/labels`);
    return response.data as { labels: unknown[] };
  },

  async createLabel(this: ApiClient, boardId, data) {
    const response = await this.client.post(`/boards/${boardId}/labels`, data);
    return response.data as { label: unknown };
  },

  async updateLabel(this: ApiClient, boardId, labelId, data) {
    const response = await this.client.put(`/boards/${boardId}/labels/${labelId}`, data);
    return response.data as { label: unknown };
  },

  async deleteLabel(this: ApiClient, boardId, labelId) {
    await this.client.delete(`/boards/${boardId}/labels/${labelId}`);
  },

  async assignLabelToCard(this: ApiClient, cardId, labelId) {
    const response = await this.client.post(`/cards/${cardId}/labels/${labelId}`);
    return response.data as { card: unknown };
  },

  async removeLabelFromCard(this: ApiClient, cardId, labelId) {
    const response = await this.client.delete(`/cards/${cardId}/labels/${labelId}`);
    return response.data as { card: unknown };
  },
};
