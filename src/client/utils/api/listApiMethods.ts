import type { ApiClient } from '../api.js';

export interface ListApiMethods {
  getListsByBoard(boardId: string): Promise<{ lists: unknown[] }>;
  getList(id: string): Promise<{ list: unknown }>;
  createList(data: { boardId: string; name: string; position?: number }): Promise<{ list: unknown }>;
  updateList(id: string, data: { name?: string; position?: number; color?: string }): Promise<{ list: unknown }>;
  deleteList(id: string): Promise<{ listId: string; removed: boolean; message: string }>;
  reorderLists(data: {
    boardId: string;
    listIds: string[];
  }): Promise<{ message: string; boardId: string; orderedListIds: string[] }>;
  moveList(listId: string, position: number): Promise<{ list: unknown }>;
  duplicateList(
    listId: string,
    targetBoardId: string,
  ): Promise<{ list: unknown; cards: readonly unknown[] }>;
}

export const listApiMethods: ListApiMethods = {
  async getListsByBoard(this: ApiClient, boardId) {
    const response = await this.client.get(`/lists/board/${boardId}`);
    return response.data as { lists: unknown[] };
  },

  async getList(this: ApiClient, id) {
    const response = await this.client.get(`/lists/${id}`);
    return response.data as { list: unknown };
  },

  async createList(this: ApiClient, data) {
    const response = await this.client.post('/lists', data);
    return response.data as { list: unknown };
  },

  async updateList(this: ApiClient, id, data) {
    const response = await this.client.put(`/lists/${id}`, data);
    return response.data as { list: unknown };
  },

  async deleteList(this: ApiClient, id) {
    const response = await this.client.delete<{ listId: string; removed: boolean; message: string }>(`/lists/${id}`);
    return response.data;
  },

  async reorderLists(this: ApiClient, data) {
    const response = await this.client.post<{ message: string; boardId: string; orderedListIds: string[] }>(
      '/lists/reorder',
      data,
    );
    return response.data;
  },

  async moveList(this: ApiClient, listId, position) {
    const response = await this.client.put(`/lists/${listId}/move`, { position });
    return response.data as { list: unknown };
  },

  async duplicateList(this: ApiClient, listId, targetBoardId) {
    const response = await this.client.post(`/lists/${listId}/duplicate`, { targetBoardId });
    return response.data as { list: unknown; cards: readonly unknown[] };
  },
};
