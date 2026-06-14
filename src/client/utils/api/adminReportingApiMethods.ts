import type {
  AdminBoardActivityReportResponse,
  AdminBoardListReportResponse,
  AdminCardListReportResponse,
  AdminMemberActivityReportResponse,
  AdminReportingBoardOptionsResponse,
} from '../../../shared/types/adminReporting.js';
import type { AdminReportingDaysFilterValue } from '../../../shared/constants/adminReporting.js';
import type { ApiClient } from '../api.js';

function appendReportingQueryParams(
  params: URLSearchParams,
  options?: {
    readonly limit?: number;
    readonly cursor?: string;
    readonly days?: AdminReportingDaysFilterValue;
    readonly boardId?: string | null;
  },
): void {
  if (options?.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  if (options?.cursor !== undefined && options.cursor.trim() !== '') {
    params.set('cursor', options.cursor.trim());
  }
  if (options?.days !== undefined && options.days !== 'all') {
    params.set('days', options.days);
  }
  if (options?.boardId != null && options.boardId.trim() !== '') {
    params.set('boardId', options.boardId.trim());
  }
}

function appendPaginationQueryParams(
  params: URLSearchParams,
  options?: {
    readonly limit?: number;
    readonly cursor?: string;
  },
): void {
  if (options?.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  if (options?.cursor !== undefined && options.cursor.trim() !== '') {
    params.set('cursor', options.cursor.trim());
  }
}

export interface AdminReportingActivityCleanupResponse {
  readonly deletedCount: number;
  readonly olderThanDays: number;
}

export interface AdminReportingApiMethods {
  getAdminReportingBoardOptions(): Promise<AdminReportingBoardOptionsResponse>;
  getAdminReportingMemberActivity(options?: {
    readonly limit?: number;
    readonly cursor?: string;
    readonly days?: AdminReportingDaysFilterValue;
    readonly boardId?: string | null;
  }): Promise<AdminMemberActivityReportResponse>;
  getAdminReportingBoardActivity(options?: {
    readonly limit?: number;
    readonly cursor?: string;
    readonly days?: AdminReportingDaysFilterValue;
    readonly boardId?: string | null;
  }): Promise<AdminBoardActivityReportResponse>;
  cleanupAdminReportingMemberActivity(
    olderThanDays: number,
  ): Promise<AdminReportingActivityCleanupResponse>;
  cleanupAdminReportingBoardActivity(
    olderThanDays: number,
  ): Promise<AdminReportingActivityCleanupResponse>;
  getAdminReportingBoardList(options?: {
    readonly limit?: number;
    readonly cursor?: string;
  }): Promise<AdminBoardListReportResponse>;
  getAdminReportingCardList(options?: {
    readonly limit?: number;
    readonly cursor?: string;
  }): Promise<AdminCardListReportResponse>;
  deleteAdminReportingBoard(boardId: string): Promise<{ message: string; boardId: string }>;
}

export const adminReportingApiMethods: AdminReportingApiMethods = {
  async getAdminReportingBoardOptions(this: ApiClient) {
    const response = await this.client.get('/admin/reporting/board-options');
    return response.data as AdminReportingBoardOptionsResponse;
  },

  async getAdminReportingMemberActivity(this: ApiClient, options) {
    const params = new URLSearchParams();
    appendReportingQueryParams(params, options);
    const suffix = params.toString();
    const response = await this.client.get(
      `/admin/reporting/member-activity${suffix === '' ? '' : `?${suffix}`}`,
    );
    return response.data as AdminMemberActivityReportResponse;
  },

  async getAdminReportingBoardActivity(this: ApiClient, options) {
    const params = new URLSearchParams();
    appendReportingQueryParams(params, options);
    const suffix = params.toString();
    const response = await this.client.get(
      `/admin/reporting/board-activity${suffix === '' ? '' : `?${suffix}`}`,
    );
    return response.data as AdminBoardActivityReportResponse;
  },

  async cleanupAdminReportingMemberActivity(this: ApiClient, olderThanDays) {
    const response = await this.client.post('/admin/reporting/member-activity/cleanup', {
      olderThanDays,
    });
    return response.data as AdminReportingActivityCleanupResponse;
  },

  async cleanupAdminReportingBoardActivity(this: ApiClient, olderThanDays) {
    const response = await this.client.post('/admin/reporting/board-activity/cleanup', {
      olderThanDays,
    });
    return response.data as AdminReportingActivityCleanupResponse;
  },

  async getAdminReportingBoardList(this: ApiClient, options) {
    const params = new URLSearchParams();
    appendPaginationQueryParams(params, options);
    const suffix = params.toString();
    const response = await this.client.get(
      `/admin/reporting/board-list${suffix === '' ? '' : `?${suffix}`}`,
    );
    return response.data as AdminBoardListReportResponse;
  },

  async getAdminReportingCardList(this: ApiClient, options) {
    const params = new URLSearchParams();
    appendPaginationQueryParams(params, options);
    const suffix = params.toString();
    const response = await this.client.get(
      `/admin/reporting/card-list${suffix === '' ? '' : `?${suffix}`}`,
    );
    return response.data as AdminCardListReportResponse;
  },

  async deleteAdminReportingBoard(this: ApiClient, boardId) {
    const response = await this.client.delete(
      `/admin/reporting/board-list/${encodeURIComponent(boardId.trim())}`,
    );
    return response.data as { message: string; boardId: string };
  },
};
