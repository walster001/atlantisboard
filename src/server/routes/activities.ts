import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../shared/types/express.js';
import { BOARD_MEMBER_AUDIT_ACTIVITY_TYPES } from '../../shared/constants/boardMemberAuditActivities.js';
import { Activity } from '../models/Activity.js';
import { hasPermission } from '../utils/permissions.js';

const router = Router();

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

// Get board activities
router.get('/boards/:boardId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { boardId } = req.params;
    
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

    const memberAudit =
      req.query.memberAudit === '1' ||
      req.query.memberAudit === 'true';

    if (memberAudit) {
      const pageSizeRaw = req.query.pageSize
        ? parseInt(String(req.query.pageSize), 10)
        : 10;
      const pageRaw = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const pageSize = Number.isFinite(pageSizeRaw)
        ? Math.min(50, Math.max(1, pageSizeRaw))
        : 10;
      const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;
      const skip = (page - 1) * pageSize;

      const filter: {
        boardId: string;
        type: { $in: readonly string[] };
      } = {
        boardId,
        type: { $in: BOARD_MEMBER_AUDIT_ACTIVITY_TYPES },
      };

      const [total, rows] = await Promise.all([
        Activity.countDocuments(filter),
        Activity.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .populate('userId', 'displayName email profilePicture'),
      ]);

      res.json({
        activities: rows,
        total,
        page,
        pageSize,
      });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const type = req.query.type as string | undefined;
    const cardId = req.query.cardId as string | undefined;
    const search = req.query.search as string | undefined;

    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const query: { boardId: string; type?: string; cardId?: string; createdAt?: { $lt: Date }; $or?: Array<{ description?: { $regex: string; $options: string } }> } = { boardId };
    if (type) {
      query.type = type;
    }
    if (cardId) {
      query.cardId = cardId;
    }
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
      .populate('userId', 'displayName email profilePicture')
      .populate('cardId', 'title');
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
    const search = req.query.search as string | undefined;

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

