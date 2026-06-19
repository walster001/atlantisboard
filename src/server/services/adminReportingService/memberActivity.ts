import {
  ADMIN_REPORTING_MEMBER_ACTIVITY_MAX_PAGE_SIZE,
  ADMIN_REPORTING_MEMBER_ACTIVITY_PAGE_SIZE,
} from '../../../shared/constants/adminReporting.js';
import {
  BOARD_MEMBER_AUDIT_ACTIVITY_TYPES,
  BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS,
} from '../../../shared/constants/boardMemberAuditActivities.js';
import type {
  AdminMemberActivityReportResponse,
  AdminMemberActivityReportRow,
} from '../../../shared/types/adminReporting.js';
import { listAdminActivityReport } from './activityReport.js';

export async function listAdminMemberActivityReport(options?: {
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
  readonly days?: number | undefined;
  readonly boardId?: string | undefined;
}): Promise<AdminMemberActivityReportResponse> {
  return await listAdminActivityReport<AdminMemberActivityReportRow>({
    activityTypes: BOARD_MEMBER_AUDIT_ACTIVITY_TYPES,
    retentionField: 'memberActivityLogRetentionDays',
    defaultBoardDays: BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS,
    defaultPageSize: ADMIN_REPORTING_MEMBER_ACTIVITY_PAGE_SIZE,
    maxPageSize: ADMIN_REPORTING_MEMBER_ACTIVITY_MAX_PAGE_SIZE,
    ...(options?.limit !== undefined ? { limit: options.limit } : {}),
    ...(options?.cursor !== undefined ? { cursor: options.cursor } : {}),
    ...(options?.days !== undefined ? { days: options.days } : {}),
    ...(options?.boardId !== undefined ? { boardId: options.boardId } : {}),
  });
}
