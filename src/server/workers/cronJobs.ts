import { Activity } from '../models/Activity.js';
import { Board } from '../models/Board.js';
import { ImportJob } from '../models/ImportJob.js';
import { BackupJob } from '../models/BackupJob.js';
import { Card } from '../models/Card.js';
import { Workspace } from '../models/Workspace.js';
import {
  BOARD_MEMBER_AUDIT_ACTIVITY_TYPES,
  BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS,
} from '../../shared/constants/boardMemberAuditActivities.js';
import { logger } from '../utils/logger.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { runScheduledBackupIfDue } from '../services/backupService.js';

/**
 * Activity log cleanup job
 * Runs weekly, respects per-workspace retention periods
 */
export async function cleanupActivityLogs(): Promise<void> {
  logger.info('Starting activity log cleanup job');

  try {
    const [workspaces, boards] = await Promise.all([
      Workspace.find({}).select('_id activityLogRetentionDays'),
      Board.find({}).select('_id workspaceId'),
    ]);

    const boardIdsByWorkspace = new Map<string, typeof boards[number]['_id'][]>();
    for (const board of boards) {
      if (board.workspaceId == null) {
        continue;
      }
      const workspaceKey = board.workspaceId.toString();
      const existing = boardIdsByWorkspace.get(workspaceKey);
      if (existing) {
        existing.push(board._id);
      } else {
        boardIdsByWorkspace.set(workspaceKey, [board._id]);
      }
    }

    let cleanedCount = 0;

    for (const workspace of workspaces) {
      const retentionDays =
        workspace.activityLogRetentionDays || BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const boardIds = boardIdsByWorkspace.get(workspace._id.toString()) ?? [];
      if (boardIds.length === 0) {
        continue;
      }

      const result = await Activity.deleteMany({
        boardId: { $in: boardIds },
        createdAt: { $lt: cutoffDate },
      });

      cleanedCount += result.deletedCount || 0;
    }

    logger.info({ cleanedCount }, 'Activity log cleanup completed');

    // Log cleanup operation
    logAuditEvent({
      userId: 'system',
      action: 'cleanup.activity.logs',
      resourceType: 'system',
      resourceId: 'system',
      metadata: { cleanedCount },
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error({ error }, 'Activity log cleanup failed');
    throw error;
  }
}

/**
 * Deletes old **member** board audit rows (`board.member.*`) per board
 * `settings.memberActivityLogRetentionDays` (UI “Log Retention”).
 */
export async function cleanupBoardMemberAuditRetention(): Promise<void> {
  logger.info('Starting board member activity audit retention cleanup');

  try {
    const { Board } = await import('../models/Board.js');
    const cursor = Board.find({})
      .select('_id settings.memberActivityLogRetentionDays')
      .lean()
      .cursor();

    let totalDeleted = 0;
    for await (const b of cursor) {
      const configured = b.settings?.memberActivityLogRetentionDays;
      const days =
        typeof configured === 'number' && configured >= 1 && configured <= 3650
          ? configured
          : BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const result = await Activity.deleteMany({
        boardId: b._id,
        type: { $in: [...BOARD_MEMBER_AUDIT_ACTIVITY_TYPES] },
        createdAt: { $lt: cutoff },
      });
      totalDeleted += result.deletedCount ?? 0;
    }

    logger.info({ totalDeleted }, 'Board member activity audit retention cleanup completed');

    logAuditEvent({
      userId: 'system',
      action: 'cleanup.member.board.audit',
      resourceType: 'system',
      resourceId: 'system',
      metadata: { totalDeleted },
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error({ error }, 'Board member activity audit retention cleanup failed');
    throw error;
  }
}

/**
 * Import job cleanup
 * Runs daily, auto-delete after 2 days
 */
export async function cleanupImportJobs(): Promise<void> {
  logger.info('Starting import job cleanup');

  try {
    // ImportJob has TTL index, but we'll also do manual cleanup of failed jobs
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 2);

    const result = await ImportJob.deleteMany({
      status: { $in: ['completed', 'failed'] },
      createdAt: { $lt: cutoffDate },
    });

    logger.info({ deletedCount: result.deletedCount || 0 }, 'Import job cleanup completed');
  } catch (error) {
    logger.error({ error }, 'Import job cleanup failed');
    throw error;
  }
}

export async function cleanupBackupJobs(): Promise<void> {
  logger.info('Starting admin backup job cleanup');
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 2);
    const result = await BackupJob.deleteMany({
      status: { $in: ['completed', 'failed'] },
      createdAt: { $lt: cutoffDate },
    });
    logger.info({ deletedCount: result.deletedCount ?? 0 }, 'Backup job cleanup completed');
  } catch (error) {
    logger.error({ error }, 'Backup job cleanup failed');
    throw error;
  }
}

/**
 * Orphaned card attachments cleanup
 * Runs daily, removes attachments for deleted cards
 */
export async function cleanupOrphanedAttachments(): Promise<void> {
  logger.info('Starting orphaned attachments cleanup');

  try {
    // Archiving was removed; reserved hook for future orphan detection (e.g. deleted boards).
    logger.info('Orphaned attachments cleanup completed (no archived-card path)');
  } catch (error) {
    logger.error({ error }, 'Orphaned attachments cleanup failed');
    throw error;
  }
}

/**
 * Reminder delivery check
 * Runs every 15 minutes
 */
export async function checkReminders(): Promise<void> {
  logger.info('Starting reminder delivery check');

  const REMINDER_BATCH_SIZE = 100;

  try {
    const now = new Date();

    const cursor = Card.find({
      'reminders.0': { $exists: true },
      completed: false,
    })
      .select('_id reminders dueDate')
      .cursor({ batchSize: REMINDER_BATCH_SIZE });

    const bulkOps: Parameters<typeof Card.bulkWrite>[0] = [];

    for await (const card of cursor) {
      if (!card.reminders || card.reminders.length === 0) continue;

      let cardChanged = false;

      for (const reminder of card.reminders) {
        // Skip if already sent and not repeating
        if (reminder.sent && !reminder.repeatFrequency) continue;

        // Skip if dismissed
        if (reminder.dismissed) continue;

        // Check if reminder should trigger
        if (reminder.triggerAt <= now) {
          cardChanged = true;
          reminder.sent = true;
          reminder.sentAt = new Date();

          // Handle repeat if overdue
          if (card.dueDate && new Date(card.dueDate) < now && reminder.repeatFrequency) {
            // Calculate next trigger time based on repeat frequency
            const frequencyMs = parseRepeatFrequency(reminder.repeatFrequency);
            if (frequencyMs > 0) {
              reminder.triggerAt = new Date(now.getTime() + frequencyMs);
              reminder.sent = false; // Reset for next trigger
            }
          }
        }
      }

      if (cardChanged) {
        bulkOps.push({
          updateOne: {
            filter: { _id: card._id },
            update: { $set: { reminders: card.reminders } },
          },
        });
      }

      if (bulkOps.length >= REMINDER_BATCH_SIZE) {
        await Card.bulkWrite(bulkOps);
        bulkOps.length = 0;
      }
    }

    if (bulkOps.length > 0) {
      await Card.bulkWrite(bulkOps);
    }

    logger.info('Reminder delivery check completed');
  } catch (error) {
    logger.error({ error }, 'Reminder delivery check failed');
    throw error;
  }
}

/**
 * Parse repeat frequency string to milliseconds
 * Supports formats like "1h", "2d", "30m", etc.
 */
function parseRepeatFrequency(frequency: string): number {
  const match = frequency.match(/^(\d+)([hdms])$/i);
  if (!match) return 0;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * (multipliers[unit] || 0);
}

/**
 * Schedule all cron jobs
 * This should be called on server startup
 */
// Store interval IDs for cleanup
const intervalIds: NodeJS.Timeout[] = [];
let lastActivityLogRun = 0;
let lastImportJobRun = 0;
let lastAttachmentRun = 0;
let lastMemberAuditRetentionRun = 0;
let lastScheduledBackupCheckRun = 0;
export function scheduleCronJobs(): void {
  if (intervalIds.length > 0) {
    logger.warn('Cron jobs already scheduled; skipping duplicate scheduleCronJobs() call');
    return;
  }
  // Activity log cleanup - weekly (every Monday at 2 AM)
  // Check every 5 minutes instead of every minute to reduce CPU usage
  const activityLogInterval = setInterval(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const timeKey = now.getTime();
    
    // Only run once per minute window to prevent duplicate executions
    if (dayOfWeek === 1 && hour === 2 && minutes === 0 && timeKey - lastActivityLogRun > 60000) {
      lastActivityLogRun = timeKey;
      cleanupActivityLogs().catch((error) => {
        logger.error({ error }, 'Scheduled activity log cleanup failed');
      });
    }
  }, 5 * 60 * 1000); // Check every 5 minutes
  intervalIds.push(activityLogInterval);

  // Import job cleanup - daily at 3 AM
  const importJobInterval = setInterval(() => {
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const timeKey = now.getTime();
    
    if (hour === 3 && minutes === 0 && timeKey - lastImportJobRun > 60000) {
      lastImportJobRun = timeKey;
      cleanupImportJobs().catch((error) => {
        logger.error({ error }, 'Scheduled import job cleanup failed');
      });
      cleanupBackupJobs().catch((error) => {
        logger.error({ error }, 'Scheduled backup job cleanup failed');
      });
    }
  }, 5 * 60 * 1000); // Check every 5 minutes
  intervalIds.push(importJobInterval);

  // Member board audit log retention (board.settings.memberActivityLogRetentionDays) — daily ~3:15 AM
  const memberAuditRetentionInterval = setInterval(() => {
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const timeKey = now.getTime();

    if (hour === 3 && minutes === 15 && timeKey - lastMemberAuditRetentionRun > 60000) {
      lastMemberAuditRetentionRun = timeKey;
      cleanupBoardMemberAuditRetention().catch((error) => {
        logger.error({ error }, 'Scheduled board member audit retention cleanup failed');
      });
    }
  }, 5 * 60 * 1000);
  intervalIds.push(memberAuditRetentionInterval);

  // Orphaned attachments cleanup - daily at 5 AM
  const attachmentInterval = setInterval(() => {
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const timeKey = now.getTime();
    
    if (hour === 5 && minutes === 0 && timeKey - lastAttachmentRun > 60000) {
      lastAttachmentRun = timeKey;
      cleanupOrphanedAttachments().catch((error) => {
        logger.error({ error }, 'Scheduled orphaned attachments cleanup failed');
      });
    }
  }, 5 * 60 * 1000); // Check every 5 minutes
  intervalIds.push(attachmentInterval);

  // Reminder delivery check - every 15 minutes
  const reminderInterval = setInterval(() => {
    checkReminders().catch((error) => {
      logger.error({ error }, 'Scheduled reminder check failed');
    });
  }, 15 * 60 * 1000);
  intervalIds.push(reminderInterval);

  // Scheduled backup run check - every 30 minutes
  const scheduledBackupInterval = setInterval(() => {
    const now = Date.now();
    if (now - lastScheduledBackupCheckRun < 60_000) {
      return;
    }
    lastScheduledBackupCheckRun = now;
    runScheduledBackupIfDue().catch((error) => {
      logger.error({ error }, 'Scheduled backup run check failed');
    });
  }, 30 * 60 * 1000);
  intervalIds.push(scheduledBackupInterval);

  logger.info('Cron jobs scheduled');
}

/**
 * Clean up all scheduled cron jobs
 */
export function cleanupCronJobs(): void {
  intervalIds.forEach((id) => clearInterval(id));
  intervalIds.length = 0;
  logger.info('Cron jobs cleaned up');
}
