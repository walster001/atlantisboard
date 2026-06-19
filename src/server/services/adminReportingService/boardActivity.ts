import {
  ADMIN_REPORTING_BOARD_ACTIVITY_MAX_PAGE_SIZE,
  ADMIN_REPORTING_BOARD_ACTIVITY_PAGE_SIZE,
} from '../../../shared/constants/adminReporting.js';
import {
  BOARD_CONTENT_ACTIVITY_TYPES,
  BOARD_CONTENT_DEFAULT_RETENTION_DAYS,
} from '../../../shared/constants/boardContentActivities.js';
import type {
  AdminBoardActivityReportResponse,
  AdminBoardActivityReportRow,
} from '../../../shared/types/adminReporting.js';
import { listAdminActivityReport } from './activityReport.js';

export async function listAdminBoardActivityReport(options?: {
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
  readonly days?: number | undefined;
  readonly boardId?: string | undefined;
}): Promise<AdminBoardActivityReportResponse> {
  return await listAdminActivityReport<AdminBoardActivityReportRow>({
    activityTypes: BOARD_CONTENT_ACTIVITY_TYPES,
    retentionField: 'activityLogRetentionDays',
    defaultBoardDays: BOARD_CONTENT_DEFAULT_RETENTION_DAYS,
    defaultPageSize: ADMIN_REPORTING_BOARD_ACTIVITY_PAGE_SIZE,
    maxPageSize: ADMIN_REPORTING_BOARD_ACTIVITY_MAX_PAGE_SIZE,
    ...(options?.limit !== undefined ? { limit: options.limit } : {}),
    ...(options?.cursor !== undefined ? { cursor: options.cursor } : {}),
    ...(options?.days !== undefined ? { days: options.days } : {}),
    ...(options?.boardId !== undefined ? { boardId: options.boardId } : {}),
  });
}
