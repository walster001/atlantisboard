import { z } from 'zod';
import type { ApiClient } from '../api.js';

export const listApiResponseSchema = z.object({
  list: z.unknown(),
});

export type ListApiResponse = z.infer<typeof listApiResponseSchema>;

export function parseListApiResponse(data: unknown): ListApiResponse {
  return listApiResponseSchema.parse(data);
}

export const listsByBoardApiResponseSchema = z.object({
  lists: z.array(z.unknown()),
});

export type ListsByBoardApiResponse = z.infer<typeof listsByBoardApiResponseSchema>;

export function parseListsByBoardApiResponse(data: unknown): ListsByBoardApiResponse {
  return listsByBoardApiResponseSchema.parse(data);
}

export const duplicateListApiResponseSchema = z.object({
  list: z.unknown(),
  cards: z.array(z.unknown()),
});

export type DuplicateListApiResponse = z.infer<typeof duplicateListApiResponseSchema>;

export function parseDuplicateListApiResponse(data: unknown): DuplicateListApiResponse {
  return duplicateListApiResponseSchema.parse(data);
}

export interface ListSummaryOption {
  readonly id: string;
  readonly name: string;
}

export function mapListSummariesToOptions(lists: readonly unknown[]): readonly ListSummaryOption[] {
  return lists.flatMap((row): readonly ListSummaryOption[] => {
    if (row == null || typeof row !== 'object') {
      return [];
    }
    const record = row as Record<string, unknown>;
    const rawId = record._id ?? record.id;
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    const rawName = record.name;
    const name = typeof rawName === 'string' ? rawName : '';
    return id !== '' && name !== '' ? [{ id, name }] : [];
  });
}

export interface ListApiMethods {
  getListsByBoard(boardId: string): Promise<ListsByBoardApiResponse>;
  getList(id: string): Promise<ListApiResponse>;
  createList(data: { boardId: string; name: string; position?: number }): Promise<ListApiResponse>;
  updateList(id: string, data: { name?: string; position?: number; color?: string }): Promise<ListApiResponse>;
  deleteList(id: string): Promise<{ listId: string; removed: boolean; message: string }>;
  reorderLists(data: {
    boardId: string;
    listIds: string[];
  }): Promise<{ message: string; boardId: string; orderedListIds: string[] }>;
  moveList(listId: string, position: number): Promise<ListApiResponse>;
  duplicateList(
    listId: string,
    targetBoardId: string,
  ): Promise<DuplicateListApiResponse>;
}

export const listApiMethods: ListApiMethods = {
  async getListsByBoard(this: ApiClient, boardId) {
    const response = await this.client.get(`/lists/board/${boardId}`);
    return parseListsByBoardApiResponse(response.data);
  },

  async getList(this: ApiClient, id) {
    const response = await this.client.get(`/lists/${id}`);
    return parseListApiResponse(response.data);
  },

  async createList(this: ApiClient, data) {
    const response = await this.client.post('/lists', data);
    return parseListApiResponse(response.data);
  },

  async updateList(this: ApiClient, id, data) {
    const response = await this.client.put(`/lists/${id}`, data);
    return parseListApiResponse(response.data);
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
    return parseListApiResponse(response.data);
  },

  async duplicateList(this: ApiClient, listId, targetBoardId) {
    const response = await this.client.post(`/lists/${listId}/duplicate`, { targetBoardId });
    return parseDuplicateListApiResponse(response.data);
  },
};
