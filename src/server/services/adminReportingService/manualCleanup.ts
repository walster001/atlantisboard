import { Activity } from '../../models/Activity.js';
import { clampManualActivityCleanupDays } from '../../../shared/adminReportingActivityRetention.js';
import { BOARD_CONTENT_ACTIVITY_TYPES } from '../../../shared/constants/boardContentActivities.js';
import { BOARD_MEMBER_AUDIT_ACTIVITY_TYPES } from '../../../shared/constants/boardMemberAuditActivities.js';
import { logAuditEvent } from '../../utils/auditLogger.js';

export interface AdminReportingActivityCleanupResult {
  readonly deletedCount: number;
  readonly olderThanDays: number;
}

async function deleteActivitiesOlderThan(
  types: readonly string[],
  olderThanDays: number,
  auditAction: string,
): Promise<AdminReportingActivityCleanupResult> {
  const days = clampManualActivityCleanupDays(olderThanDays);
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const result = await Activity.deleteMany({
    type: { $in: [...types] },
    createdAt: { $lt: cutoff },
  });
  const deletedCount = result.deletedCount ?? 0;

  logAuditEvent({
    userId: 'system',
    action: auditAction,
    resourceType: 'system',
    resourceId: 'system',
    metadata: { deletedCount, olderThanDays: days },
    timestamp: new Date(),
  });

  return { deletedCount, olderThanDays: days };
}

export async function manualCleanupAdminMemberActivity(
  olderThanDays: number,
): Promise<AdminReportingActivityCleanupResult> {
  return deleteActivitiesOlderThan(
    BOARD_MEMBER_AUDIT_ACTIVITY_TYPES,
    olderThanDays,
    'admin.reporting.cleanup.member.activity',
  );
}

export async function manualCleanupAdminBoardActivity(
  olderThanDays: number,
): Promise<AdminReportingActivityCleanupResult> {
  return deleteActivitiesOlderThan(
    BOARD_CONTENT_ACTIVITY_TYPES,
    olderThanDays,
    'admin.reporting.cleanup.board.activity',
  );
}
