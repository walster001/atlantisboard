import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../types/express.js';
import { BOARD_MEMBER_AUDIT_ACTIVITY_TYPES } from '../../shared/constants/boardMemberAuditActivities.js';
import { Activity } from '../models/Activity.js';
import { hasPermission } from '../utils/permissions.js';
import { sanitizeActivitySearchInput } from '../../shared/utils/escapeRegex.js';
import { parseOrThrow } from '../utils/zodValidation.js';
import { handleApiRouteError } from '../utils/mapServiceErrorToHttp.js';

const router = Router();

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

/** Upper bound for one local calendar day (DST can exceed 24h wall span in UTC). */
const MEMBER_AUDIT_MAX_SPAN_MS = 49 * 60 * 60 * 1000;

const boardActivitiesQuerySchema = z
  .object({
    memberAudit: z.enum(['1', 'true']).optional(),
    dayStart: z.coerce.number().finite().optional(),
    dayEnd: z.coerce.number().finite().optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    type: z.string().min(1).optional(),
    cardId: z.string().min(1).optional(),
    search: z.string().optional(),
    cursor: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    const memberAudit = data.memberAudit === '1' || data.memberAudit === 'true';
    if (!memberAudit) {
      return;
    }
    if (data.dayStart === undefined || data.dayEnd === undefined) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Member audit log requires dayStart and dayEnd (epoch milliseconds, local calendar day bounds).',
        path: ['dayStart'],
      });
      return;
    }
    if (data.dayEnd < data.dayStart) {
      ctx.addIssue({
        code: 'custom',
        message: 'dayEnd must be greater than or equal to dayStart.',
        path: ['dayEnd'],
      });
      return;
    }
    if (data.dayEnd - data.dayStart > MEMBER_AUDIT_MAX_SPAN_MS) {
      ctx.addIssue({
        code: 'custom',
        message: 'dayStart/dayEnd span is too large for a single-day member audit query.',
        path: ['dayEnd'],
      });
    }
  });

// Get board activities
router.get('/boards/:boardId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { boardId } = req.params;
    const query = parseOrThrow(boardActivitiesQuerySchema, req.query);

    // Check permissions (admin/manager surfaces only)
    const allowed = await hasPermission(authReq.user, boardId, 'boards.members.view');
    if (!allowed) {
      res.status(403).json({
        error: {
          message: 'Insufficient permissions to view activity logs',
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }

    const memberAudit = query.memberAudit === '1' || query.memberAudit === 'true';

    if (memberAudit) {
      const dayStartMs = query.dayStart as number;
      const dayEndMs = query.dayEnd as number;

      const dayStart = new Date(dayStartMs);
      const dayEnd = new Date(dayEndMs);
      const memberAuditDayFetchLimit = 10_000;

      const filter: {
        boardId: string;
        type: { $in: readonly string[] };
        createdAt: { $gte: Date; $lte: Date };
      } = {
        boardId,
        type: { $in: BOARD_MEMBER_AUDIT_ACTIVITY_TYPES },
        createdAt: { $gte: dayStart, $lte: dayEnd },
      };

      const [total, rows] = await Promise.all([
        Activity.countDocuments(filter),
        Activity.find(filter)
          .sort({ createdAt: -1 })
          .limit(memberAuditDayFetchLimit)
          .populate('userId', 'displayName email profilePicture'),
      ]);

      res.json({
        activities: rows,
        total,
      });
      return;
    }

    const limit = query.limit ?? 100;
    const search = sanitizeActivitySearchInput(query.search);

    const cursor = query.cursor;
    const activityQuery: {
      boardId: string;
      type?: string;
      cardId?: string;
      createdAt?: { $lt: Date };
      $or?: Array<{ description?: { $regex: string; $options: string } }>;
    } = { boardId };
    if (query.type !== undefined) {
      activityQuery.type = query.type;
    }
    if (query.cardId !== undefined) {
      activityQuery.cardId = query.cardId;
    }
    if (search) {
      activityQuery.$or = [{ description: { $regex: search, $options: 'i' } }];
    }

    if (cursor !== undefined) {
      const cursorTs = Number.parseInt(cursor, 10);
      if (Number.isFinite(cursorTs) && cursorTs > 0) {
        activityQuery.createdAt = { $lt: new Date(cursorTs) };
      }
    }
    const activities = await Activity.find(activityQuery)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('userId', 'displayName email profilePicture')
      .populate('cardId', 'title');
    const page = activities.slice(0, limit);
    const nextCursor =
      activities.length > limit && page.length > 0
        ? String(page[page.length - 1].createdAt.getTime())
        : undefined;
    res.json({ activities: page, ...(nextCursor !== undefined ? { nextCursor } : {}) });
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
});

// Get card activities
router.get('/cards/:cardId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { cardId } = req.params;

    // Get card to find board
    const { Card } = await import('../models/Card.js');
    const card = await Card.findById(cardId);
    if (!card) {
      res.status(404).json({
        error: {
          message: 'Card not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    // Check permissions
    const allowed = await hasPermission(authReq.user, card.boardId.toString(), 'boards.members.view');
    if (!allowed) {
      res.status(403).json({
        error: {
          message: 'Insufficient permissions to view activity logs',
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const search = sanitizeActivitySearchInput(
      typeof req.query.search === 'string' ? req.query.search : undefined,
    );

    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const query: { cardId: string; createdAt?: { $lt: Date }; $or?: Array<{ description?: { $regex: string; $options: string } }> } = { cardId };
    if (search) {
      query.$or = [
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    if (cursor !== undefined) {
      const cursorTs = Number.parseInt(cursor, 10);
      if (Number.isFinite(cursorTs) && cursorTs > 0) {
        query.createdAt = { $lt: new Date(cursorTs) };
      }
    }
    const activities = await Activity.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('userId', 'displayName email profilePicture');
    const page = activities.slice(0, limit);
    const nextCursor =
      activities.length > limit && page.length > 0
        ? String(page[page.length - 1].createdAt.getTime())
        : undefined;
    res.json({ activities: page, ...(nextCursor !== undefined ? { nextCursor } : {}) });
  } catch (error) {
    next(error);
  }
});

export { router as activityRoutes };
