import type { ApiClient } from '../api.js';

export interface ActivityApiMethods {
  getBoardActivities(
    boardId: string,
    options?: {
      limit?: number;
      type?: string;
      search?: string;
      cardId?: string;
      cursor?: string;
      memberAudit?: boolean;
      boardActivity?: boolean;
      dayStartMs?: number;
      dayEndMs?: number;
    }
  ): Promise<
    | { activities: unknown[]; nextCursor?: string }
    | { activities: unknown[]; total: number }
  >;
  getCardActivities(
    cardId: string,
    limit?: number,
    search?: string,
    cursor?: string
  ): Promise<{ activities: unknown[]; nextCursor?: string }>;
}

export const activityApiMethods: ActivityApiMethods = {
  async getBoardActivities(this: ApiClient, boardId, options) {
    const params = new URLSearchParams();
    const o = options ?? {};
    if (o.limit !== undefined) params.append('limit', o.limit.toString());
    if (o.type !== undefined && o.type !== '') params.append('type', o.type);
    if (o.search !== undefined && o.search !== '') params.append('search', o.search);
    if (o.cardId !== undefined && o.cardId !== '') params.append('cardId', o.cardId);
    if (o.cursor !== undefined && o.cursor !== '') params.append('cursor', o.cursor);
    if (o.memberAudit === true) params.append('memberAudit', 'true');
    if (o.boardActivity === true) params.append('boardActivity', 'true');
    if (o.dayStartMs !== undefined) params.append('dayStart', String(o.dayStartMs));
    if (o.dayEndMs !== undefined) params.append('dayEnd', String(o.dayEndMs));
    const response = await this.client.get(`/activities/boards/${boardId}?${params.toString()}`);
    return response.data as
      | { activities: unknown[]; nextCursor?: string }
      | { activities: unknown[]; total: number };
  },

  async getCardActivities(this: ApiClient, cardId, limit, search, cursor) {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (search) params.append('search', search);
    if (cursor) params.append('cursor', cursor);
    const response = await this.client.get(`/activities/cards/${cardId}?${params.toString()}`);
    return response.data as { activities: unknown[]; nextCursor?: string };
  },
};
