import type { ApiClient } from '../api.js';

export interface ChecklistApiMethods {
  createChecklist(data: { cardId: string; title: string }): Promise<{ card: unknown }>;
  updateChecklist(checklistId: string, data: { cardId: string; title?: string }): Promise<{ card: unknown }>;
  deleteChecklist(checklistId: string, cardId: string): Promise<void>;
  createChecklistItem(data: {
    cardId: string;
    checklistId: string;
    text: string;
    sortOrder?: number;
  }): Promise<{ card: unknown }>;
  updateChecklistItem(itemId: string, data: {
    cardId: string;
    checklistId: string;
    text?: string;
    completed?: boolean;
    sortOrder?: number;
  }): Promise<{ card: unknown }>;
  deleteChecklistItem(itemId: string, data: { cardId: string; checklistId: string }): Promise<void>;
}

export const checklistApiMethods: ChecklistApiMethods = {
  async createChecklist(this: ApiClient, data) {
    const response = await this.client.post('/checklists', data);
    return response.data as { card: unknown };
  },

  async updateChecklist(this: ApiClient, checklistId, data) {
    const response = await this.client.put(`/checklists/${checklistId}`, data);
    return response.data as { card: unknown };
  },

  async deleteChecklist(this: ApiClient, checklistId, cardId) {
    await this.client.delete(`/checklists/${checklistId}`, { data: { cardId } });
  },

  async createChecklistItem(this: ApiClient, data) {
    const response = await this.client.post('/checklists/items', data);
    return response.data as { card: unknown };
  },

  async updateChecklistItem(this: ApiClient, itemId, data) {
    const response = await this.client.put(`/checklists/items/${itemId}`, data);
    return response.data as { card: unknown };
  },

  async deleteChecklistItem(this: ApiClient, itemId, data) {
    await this.client.delete(`/checklists/items/${itemId}`, { data });
  },
};
