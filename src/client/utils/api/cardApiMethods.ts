import type { ApiClient } from '../api.js';
import { z } from 'zod';

export const cardApiResponseSchema = z.object({
  card: z.unknown(),
});

export type CardApiResponse = z.infer<typeof cardApiResponseSchema>;

export function parseCardApiResponse(data: unknown): CardApiResponse {
  return cardApiResponseSchema.parse(data);
}

export interface CardApiMethods {
  getCardsByList(
    listId: string,
    options?: { view?: 'summary' | 'detail'; fields?: readonly string[] }
  ): Promise<{ cards: unknown[] }>;
  getBoardKanbanSnapshot(
    boardId: string,
    options?: { listLimit?: number; listCursor?: string }
  ): Promise<{
    board: unknown;
    lists: unknown[];
    cardsByList: Record<string, unknown[]>;
    nextListCursor?: string;
    hasMoreLists?: boolean;
  }>;
  postBoardCardDescriptionsBatch(
    boardId: string,
    cardIds: readonly string[],
  ): Promise<{ cards: ReadonlyArray<{ id: string; description: string; descriptionHtml?: string }> }>;
  patchBoardListsBulkColor(boardId: string, body: { color: string }): Promise<{ updatedCount: number }>;
  patchBoardCardsBulkColor(boardId: string, body: { color: string; listId?: string }): Promise<{ updatedCount: number }>;
  getCard(id: string): Promise<CardApiResponse>;
  createCard(data: {
    listId: string;
    boardId: string;
    title: string;
    description?: string;
    position?: number;
  }): Promise<CardApiResponse>;
  updateCard(id: string, data: {
    title?: string;
    description?: string;
    listId?: string;
    position?: number;
    color?: string;
    cover?: string;
    dueDate?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    completed?: boolean;
  }): Promise<CardApiResponse>;
  deleteCard(id: string): Promise<{ cardId: string; removed: boolean; message: string }>;
  moveCard(cardId: string, listId: string, position: number): Promise<CardApiResponse>;
  reorderCards(
    listId: string,
    cardIds: string[],
  ): Promise<{
    message: string;
    listId: string;
    orderedCardIds: string[];
    mode: 'bulk_reflow';
    deprecatedForInteractiveDnD: boolean;
  }>;
  duplicateCard(id: string, targetListId: string): Promise<CardApiResponse>;
  addCardAssignee(cardId: string, userId: string): Promise<CardApiResponse>;
  removeCardAssignee(cardId: string, userId: string): Promise<CardApiResponse>;
  addCardReminder(cardId: string, data: { triggerAt: string; repeatFrequency?: string }): Promise<CardApiResponse>;
  updateCardReminder(
    cardId: string,
    reminderId: string,
    data: { triggerAt?: string; repeatFrequency?: string },
  ): Promise<CardApiResponse>;
  deleteCardReminder(cardId: string, reminderId: string): Promise<CardApiResponse>;
  dismissCardReminder(cardId: string, reminderId: string): Promise<CardApiResponse>;
}

export const cardApiMethods: CardApiMethods = {
  async getCardsByList(this: ApiClient, listId, options) {
    const params = new URLSearchParams();
    if (options?.view !== undefined) params.set('view', options.view);
    if (Array.isArray(options?.fields) && options.fields.length > 0) params.set('fields', options.fields.join(','));
    const suffix = params.toString();
    const response = await this.client.get(`/cards/list/${listId}${suffix === '' ? '' : `?${suffix}`}`);
    return response.data as { cards: unknown[] };
  },

  async getBoardKanbanSnapshot(this: ApiClient, boardId, options) {
    const params = new URLSearchParams();
    if (typeof options?.listLimit === 'number') params.set('listLimit', String(options.listLimit));
    if (typeof options?.listCursor === 'string' && options.listCursor.trim() !== '') {
      params.set('listCursor', options.listCursor.trim());
    }
    const suffix = params.toString();
    const response = await this.client.get(`/boards/${boardId}/kanban-snapshot${suffix === '' ? '' : `?${suffix}`}`);
    return response.data as {
      board: unknown;
      lists: unknown[];
      cardsByList: Record<string, unknown[]>;
      nextListCursor?: string;
      hasMoreLists?: boolean;
    };
  },

  async postBoardCardDescriptionsBatch(this: ApiClient, boardId, cardIds) {
    const params = new URLSearchParams();
    params.set('cardIds', [...cardIds].join(','));
    const response = await this.client.get(
      `/boards/${boardId}/cards/descriptions-batch?${params.toString()}`,
    );
    const data = response.data;
    if (data == null || typeof data !== 'object' || !('cards' in data)) return { cards: [] };
    const cards = (data as { cards: unknown }).cards;
    if (!Array.isArray(cards)) return { cards: [] };
    return { cards: cards as ReadonlyArray<{ id: string; description: string; descriptionHtml?: string }> };
  },

  async patchBoardListsBulkColor(this: ApiClient, boardId, body) {
    const response = await this.client.patch(`/boards/${boardId}/lists/bulk-color`, body);
    return response.data as { updatedCount: number };
  },

  async patchBoardCardsBulkColor(this: ApiClient, boardId, body) {
    const response = await this.client.patch(`/boards/${boardId}/cards/bulk-color`, body);
    return response.data as { updatedCount: number };
  },

  async getCard(this: ApiClient, id) {
    const response = await this.client.get(`/cards/${id}`);
    return parseCardApiResponse(response.data);
  },

  async createCard(this: ApiClient, data) {
    const response = await this.client.post('/cards', data);
    return parseCardApiResponse(response.data);
  },

  async updateCard(this: ApiClient, id, data) {
    const response = await this.client.put(`/cards/${id}`, data);
    return parseCardApiResponse(response.data);
  },

  async deleteCard(this: ApiClient, id) {
    const response = await this.client.delete<{ cardId: string; removed: boolean; message: string }>(`/cards/${id}`);
    return response.data;
  },

  async moveCard(this: ApiClient, cardId, listId, position) {
    const response = await this.client.put(`/cards/${cardId}/move`, { listId, position });
    return parseCardApiResponse(response.data);
  },

  async reorderCards(this: ApiClient, listId, cardIds) {
    const response = await this.client.put<{
      message: string;
      listId: string;
      orderedCardIds: string[];
      mode: 'bulk_reflow';
      deprecatedForInteractiveDnD: boolean;
    }>('/cards/reorder', { listId, cardIds, mode: 'bulk_reflow' });
    return response.data;
  },

  async duplicateCard(this: ApiClient, id, targetListId) {
    const response = await this.client.post(`/cards/${id}/duplicate`, { targetListId });
    return parseCardApiResponse(response.data);
  },

  async addCardAssignee(this: ApiClient, cardId, userId) {
    const response = await this.client.post(`/cards/${cardId}/assignees`, { userId });
    return parseCardApiResponse(response.data);
  },

  async removeCardAssignee(this: ApiClient, cardId, userId) {
    const response = await this.client.delete(`/cards/${cardId}/assignees/${userId}`);
    return parseCardApiResponse(response.data);
  },

  async addCardReminder(this: ApiClient, cardId, data) {
    const response = await this.client.post(`/cards/${cardId}/reminders`, data);
    return parseCardApiResponse(response.data);
  },

  async updateCardReminder(this: ApiClient, cardId, reminderId, data) {
    const response = await this.client.put(`/cards/${cardId}/reminders/${reminderId}`, data);
    return parseCardApiResponse(response.data);
  },

  async deleteCardReminder(this: ApiClient, cardId, reminderId) {
    const response = await this.client.delete(`/cards/${cardId}/reminders/${reminderId}`);
    return parseCardApiResponse(response.data);
  },

  async dismissCardReminder(this: ApiClient, cardId, reminderId) {
    const response = await this.client.put(`/cards/${cardId}/reminders/${reminderId}/dismiss`);
    return parseCardApiResponse(response.data);
  },
};
