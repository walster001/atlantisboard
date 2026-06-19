import type { Router } from 'express';
import { adminMasterDeleteBoard } from '../../services/boardService/index.js';
import { listAdminBoardActivityReport } from '../../services/adminReportingService/boardActivity.js';
import { listAdminBoardListReport } from '../../services/adminReportingService/boardList.js';
import { listAdminReportingBoardOptions } from '../../services/adminReportingService/boardList.js';
import { listAdminCardListReport } from '../../services/adminReportingService/cardList.js';
import { listAdminMemberActivityReport } from '../../services/adminReportingService/memberActivity.js';
import {
  manualCleanupAdminBoardActivity,
  manualCleanupAdminMemberActivity,
} from '../../services/adminReportingService/manualCleanup.js';
import { parseAdminReportingDaysFilter } from '../../../shared/adminReportingActivityRetention.js';
import type { AuthenticatedRequest } from '../../types/express.js';
import { parseOrThrow } from '../../utils/zodValidation.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';
import {
  boardActivityQuerySchema,
  activityCleanupBodySchema,
  boardListQuerySchema,
  cardListQuerySchema,
  memberActivityQuerySchema,
  mongoObjectIdSchema,
} from './reportingQuerySchemas.js';

export function registerReportingRoutes(router: Router): void {
  router.get('/reporting/board-options', async (_req, res, next) => {
    try {
      const result = await listAdminReportingBoardOptions();
      res.json(result);
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });

  router.get('/reporting/member-activity', async (req, res, next) => {
    try {
      const query = parseOrThrow(memberActivityQuerySchema, req.query);
      const parsedDays = parseAdminReportingDaysFilter(query.days);
      const result = await listAdminMemberActivityReport({
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
        ...(parsedDays !== undefined ? { days: parsedDays } : {}),
        ...(query.boardId !== undefined ? { boardId: query.boardId } : {}),
      });
      res.json(result);
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });

  router.get('/reporting/board-activity', async (req, res, next) => {
    try {
      const query = parseOrThrow(boardActivityQuerySchema, req.query);
      const parsedDays = parseAdminReportingDaysFilter(query.days);
      const result = await listAdminBoardActivityReport({
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
        ...(parsedDays !== undefined ? { days: parsedDays } : {}),
        ...(query.boardId !== undefined ? { boardId: query.boardId } : {}),
      });
      res.json(result);
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });

  router.post('/reporting/member-activity/cleanup', async (req, res, next) => {
    try {
      const body = parseOrThrow(activityCleanupBodySchema, req.body);
      const result = await manualCleanupAdminMemberActivity(body.olderThanDays);
      res.json(result);
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });

  router.post('/reporting/board-activity/cleanup', async (req, res, next) => {
    try {
      const body = parseOrThrow(activityCleanupBodySchema, req.body);
      const result = await manualCleanupAdminBoardActivity(body.olderThanDays);
      res.json(result);
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });

  router.get('/reporting/board-list', async (req, res, next) => {
    try {
      const query = parseOrThrow(boardListQuerySchema, req.query);
      const result = await listAdminBoardListReport({
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      });
      res.json(result);
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });

  router.delete('/reporting/board-list/:boardId', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const boardId = parseOrThrow(mongoObjectIdSchema, req.params.boardId);
      const deleted = await adminMasterDeleteBoard(boardId, authReq.user.id);
      if (!deleted) {
        res.status(404).json({
          error: {
            message: 'Board not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }
      res.json({ message: 'Board deleted successfully', boardId });
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });

  router.get('/reporting/card-list', async (req, res, next) => {
    try {
      const query = parseOrThrow(cardListQuerySchema, req.query);
      const result = await listAdminCardListReport({
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      });
      res.json(result);
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });
}
