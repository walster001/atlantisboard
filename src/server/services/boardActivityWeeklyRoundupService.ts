import mongoose from 'mongoose';
import { Types } from 'mongoose';
import { Activity } from '../models/Activity.js';
import { Board } from '../models/Board.js';
import { User } from '../models/User.js';
import { hasPermission } from '../utils/permissions.js';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/domainErrors.js';
import {
  BOARD_ACTIVITY_ROUNDUP_EMAIL_LAYOUT,
  BOARD_ACTIVITY_ROUNDUP_EMAIL_TEMPLATE,
  BOARD_ACTIVITY_ROUNDUP_PERIOD_DAYS,
} from '../../shared/constants/boardActivityEmailRoundup.js';
import { BOARD_CONTENT_ACTIVITY_TYPES } from '../../shared/constants/boardContentActivities.js';
import { sendEmail } from './emailService.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { logger } from '../utils/logger.js';
import {
  buildRoundupActivitiesHtml,
  formatRoundupPeriodLabel,
  type RoundupActivityRow,
} from './boardActivityWeeklyRoundup/formatting.js';
import { filterRoundupRecipientsToBoardMembers } from './boardActivityWeeklyRoundup/recipients.js';

function getAppUrl(): string {
  return process.env.APP_URL ?? process.env.BASE_URL ?? 'http://localhost:3000';
}

export function getWeeklyRoundupWindow(
  now: Date = new Date(),
  periodDays: number = BOARD_ACTIVITY_ROUNDUP_PERIOD_DAYS,
): { readonly start: Date; readonly end: Date } {
  const end = now;
  const start = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  return { start, end };
}

function resolveActorName(populated: unknown): string {
  if (populated != null && typeof populated === 'object') {
    const record = populated as { displayName?: unknown; email?: unknown };
    if (typeof record.displayName === 'string' && record.displayName.trim() !== '') {
      return record.displayName.trim();
    }
    if (typeof record.email === 'string' && record.email.trim() !== '') {
      return record.email.trim();
    }
  }
  return 'Someone';
}

export interface RoundupBoardLean {
  readonly _id: mongoose.Types.ObjectId;
  readonly name: string;
  readonly ownerId: mongoose.Types.ObjectId;
  readonly members: ReadonlyArray<{ userId: mongoose.Types.ObjectId }>;
  readonly settings: {
    readonly activityLogEmailRoundupUserIds?: readonly mongoose.Types.ObjectId[] | undefined;
  };
}

export interface SendBoardActivityRoundupResult {
  readonly sent: number;
  readonly skipped: number;
  readonly activityCount: number;
  readonly recipientCount: number;
}

async function sendRoundupForBoard(
  board: RoundupBoardLean,
  window: { readonly start: Date; readonly end: Date },
  options?: {
    readonly subjectPrefix?: string;
    readonly sendWhenEmpty?: boolean;
  },
): Promise<SendBoardActivityRoundupResult> {
  const configuredIds =
    board.settings.activityLogEmailRoundupUserIds?.map((id) => id.toString()) ?? [];
  const recipientUserIds = filterRoundupRecipientsToBoardMembers(board, configuredIds);
  if (recipientUserIds.length === 0) {
    return { sent: 0, skipped: 0, activityCount: 0, recipientCount: 0 };
  }

  const activities = await Activity.find({
    boardId: new Types.ObjectId(board._id.toString()),
    type: { $in: [...BOARD_CONTENT_ACTIVITY_TYPES] },
    createdAt: { $gte: window.start, $lte: window.end },
  })
    .sort({ createdAt: -1 })
    .populate('userId', 'displayName email')
    .lean();

  const activityCount = activities.length;
  if (activityCount === 0 && options?.sendWhenEmpty !== true) {
    return {
      sent: 0,
      skipped: recipientUserIds.length,
      activityCount: 0,
      recipientCount: recipientUserIds.length,
    };
  }

  const rows: RoundupActivityRow[] = activities.map((row) => ({
    createdAt: row.createdAt,
    description: row.description,
    actorName: resolveActorName(row.userId),
  }));

  const { activitiesHtml, activityCount: renderedActivityCount } = buildRoundupActivitiesHtml(rows);
  const periodLabel = formatRoundupPeriodLabel(window.start, window.end);
  const boardId = board._id.toString();
  const boardUrl = `${getAppUrl()}/boards/${encodeURIComponent(boardId)}`;
  const subjectPrefix = options?.subjectPrefix ?? 'Weekly activity roundup';
  const subject = `${subjectPrefix}: ${board.name}`;

  const users = await User.find({ _id: { $in: recipientUserIds } })
    .select('email')
    .lean();
  const emails = users
    .map((u) => (typeof u.email === 'string' ? u.email.trim() : ''))
    .filter((email) => email !== '');

  let sent = 0;
  for (const to of emails) {
    const ok = await sendEmail({
      to,
      subject,
      template: BOARD_ACTIVITY_ROUNDUP_EMAIL_TEMPLATE,
      context: {
        layout: BOARD_ACTIVITY_ROUNDUP_EMAIL_LAYOUT,
        boardName: board.name,
        periodLabel,
        activityCount: renderedActivityCount,
        multipleActivities: renderedActivityCount !== 1,
        activitiesHtml,
        boardUrl,
      },
    });
    if (ok) {
      sent += 1;
    }
  }

  return {
    sent,
    skipped: emails.length - sent,
    activityCount: renderedActivityCount,
    recipientCount: recipientUserIds.length,
  };
}

export interface ManualBoardActivityRoundupResult extends SendBoardActivityRoundupResult {
  readonly periodLabel: string;
}

/**
 * Sends an on-demand activity roundup email to the board's configured recipients.
 */
export async function sendManualBoardActivityRoundup(
  boardId: string,
  userId: string,
): Promise<ManualBoardActivityRoundupResult> {
  const board = await Board.findById(boardId)
    .select('_id name ownerId members settings.activityLogEmailRoundupUserIds')
    .lean();
  if (!board) {
    throw new NotFoundError('Board not found');
  }

  const isOwner = board.ownerId.toString() === userId;
  if (!isOwner) {
    const canSend =
      (await hasPermission({ id: userId }, boardId, 'boards.settings.update')) ||
      (await hasPermission({ id: userId }, boardId, 'boards.update'));
    if (!canSend) {
      throw new ForbiddenError('Insufficient permissions to send activity roundup');
    }
  }

  const configuredIds =
    board.settings.activityLogEmailRoundupUserIds?.map((id) => id.toString()) ?? [];
  const recipientUserIds = filterRoundupRecipientsToBoardMembers(board, configuredIds);
  if (recipientUserIds.length === 0) {
    throw new ValidationError('Add at least one roundup recipient before sending');
  }

  const window = getWeeklyRoundupWindow();
  const result = await sendRoundupForBoard(board, window, {
    subjectPrefix: 'Activity roundup',
    sendWhenEmpty: true,
  });
  const periodLabel = formatRoundupPeriodLabel(window.start, window.end);

  if (result.sent === 0) {
    throw new ValidationError(
      'Could not send roundup emails. Check that SMTP is configured and recipients have valid email addresses.',
    );
  }

  logAuditEvent({
    userId,
    action: 'email.board.activity.roundup.manual',
    resourceType: 'board',
    resourceId: boardId,
    metadata: {
      sent: result.sent,
      skipped: result.skipped,
      activityCount: result.activityCount,
      recipientCount: result.recipientCount,
      periodLabel,
    },
    timestamp: new Date(),
  });

  return { ...result, periodLabel };
}

/**
 * Sends weekly board content activity roundup emails for boards with the feature enabled.
 */
export async function sendBoardActivityWeeklyRoundup(): Promise<void> {
  logger.info('Starting board activity weekly roundup job');

  const window = getWeeklyRoundupWindow();
  let boardsProcessed = 0;
  let emailsSent = 0;
  let emailsSkipped = 0;

  try {
    const cursor = Board.find({
      'settings.activityLogEmailRoundupEnabled': true,
      'settings.activityLogEmailRoundupUserIds.0': { $exists: true },
    })
      .select('_id name ownerId members settings.activityLogEmailRoundupUserIds')
      .lean()
      .cursor();

    for await (const board of cursor) {
      boardsProcessed += 1;
      try {
        const result = await sendRoundupForBoard(board, window);
        emailsSent += result.sent;
        emailsSkipped += result.skipped;
      } catch (error) {
        logger.error(
          { error, boardId: board._id.toString() },
          'Board activity weekly roundup failed for board',
        );
      }
    }

    logger.info(
      { boardsProcessed, emailsSent, emailsSkipped, periodStart: window.start, periodEnd: window.end },
      'Board activity weekly roundup completed',
    );

    logAuditEvent({
      userId: 'system',
      action: 'email.board.activity.roundup',
      resourceType: 'system',
      resourceId: 'system',
      metadata: { boardsProcessed, emailsSent, emailsSkipped },
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error({ error }, 'Board activity weekly roundup job failed');
    throw error;
  }
}
