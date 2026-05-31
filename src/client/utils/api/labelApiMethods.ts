import { z } from 'zod';
import type { ApiClient } from '../api.js';
import { parseCardApiResponse, type CardApiResponse } from './cardApiMethods.js';

export const boardLabelsApiResponseSchema = z.object({
  labels: z.array(z.unknown()),
});

export type BoardLabelsApiResponse = z.infer<typeof boardLabelsApiResponseSchema>;

export function parseBoardLabelsApiResponse(data: unknown): BoardLabelsApiResponse {
  return boardLabelsApiResponseSchema.parse(data);
}

export const labelApiResponseSchema = z.object({
  label: z.unknown(),
});

export type LabelApiResponse = z.infer<typeof labelApiResponseSchema>;

export function parseLabelApiResponse(data: unknown): LabelApiResponse {
  return labelApiResponseSchema.parse(data);
}

export interface LabelApiMethods {
  getBoardLabels(boardId: string): Promise<BoardLabelsApiResponse>;
  createLabel(boardId: string, data: { name: string; color: string }): Promise<LabelApiResponse>;
  updateLabel(boardId: string, labelId: string, data: { name?: string; color?: string }): Promise<LabelApiResponse>;
  deleteLabel(boardId: string, labelId: string): Promise<void>;
  assignLabelToCard(cardId: string, labelId: string): Promise<CardApiResponse>;
  removeLabelFromCard(cardId: string, labelId: string): Promise<CardApiResponse>;
}

export const labelApiMethods: LabelApiMethods = {
  async getBoardLabels(this: ApiClient, boardId) {
    const response = await this.client.get(`/boards/${boardId}/labels`);
    return parseBoardLabelsApiResponse(response.data);
  },

  async createLabel(this: ApiClient, boardId, data) {
    const response = await this.client.post(`/boards/${boardId}/labels`, data);
    return parseLabelApiResponse(response.data);
  },

  async updateLabel(this: ApiClient, boardId, labelId, data) {
    const response = await this.client.put(`/boards/${boardId}/labels/${labelId}`, data);
    return parseLabelApiResponse(response.data);
  },

  async deleteLabel(this: ApiClient, boardId, labelId) {
    await this.client.delete(`/boards/${boardId}/labels/${labelId}`);
  },

  async assignLabelToCard(this: ApiClient, cardId, labelId) {
    const response = await this.client.post(`/cards/${cardId}/labels/${labelId}`);
    return parseCardApiResponse(response.data);
  },

  async removeLabelFromCard(this: ApiClient, cardId, labelId) {
    const response = await this.client.delete(`/cards/${cardId}/labels/${labelId}`);
    return parseCardApiResponse(response.data);
  },
};
