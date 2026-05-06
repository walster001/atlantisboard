import { type Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../../shared/types/express.js';
import {
  createBoard,
  deleteBoard,
  getBoardById,
  getBoardsByWorkspace,
  getUserBoards,
  updateBoard,
} from '../../services/boardService.js';
import { normalizeBoardThemeSettings } from '../../../shared/boardTheme.js';
import { selectFields } from './helpers.js';
import { boardViewQuerySchema, createBoardSchema, updateBoardSchema } from './schemas.js';

export function registerBoardCollectionRoutes(router: Router): void {
  router.post('/', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const validated = createBoardSchema.parse(req.body);
      const normalizedThemeSettings =
        validated.themeSettings !== undefined
          ? normalizeBoardThemeSettings(validated.themeSettings)
          : undefined;
      const board = await createBoard({
        ...validated,
        ...(normalizedThemeSettings !== undefined ? { themeSettings: normalizedThemeSettings } : {}),
        ownerId: authReq.user.id,
      });

      res.status(201).json({ board });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            details: error.issues,
          },
        });
        return;
      }
      if (error instanceof Error && error.message.includes('permissions')) {
        res.status(403).json({
          error: {
            message: error.message,
            code: 'FORBIDDEN',
            statusCode: 403,
          },
        });
        return;
      }
      next(error);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const workspaceId = req.query.workspaceId as string | undefined;
      const query = boardViewQuerySchema.parse(req.query);
      const options =
        query.view === undefined && query.skip === undefined && query.limit === undefined
          ? undefined
          : {
              ...(query.view !== undefined ? { view: query.view } : {}),
              ...(query.skip !== undefined ? { skip: query.skip } : {}),
              ...(query.limit !== undefined ? { limit: query.limit } : {}),
            };
      const boards = await getUserBoards(authReq.user.id, workspaceId, options);
      const responseBoards = query.view === 'summary' ? selectFields(boards, query.fields) : boards;
      const hasMore = query.limit !== undefined && boards.length === query.limit;
      res.json({
        boards: responseBoards,
        ...(query.limit !== undefined ? { hasMore } : {}),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            details: error.issues,
          },
        });
        return;
      }
      next(error);
    }
  });

  router.get('/workspace/:workspaceId', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const query = boardViewQuerySchema.parse(req.query);
      const options =
        query.view === undefined && query.skip === undefined && query.limit === undefined
          ? undefined
          : {
              ...(query.view !== undefined ? { view: query.view } : {}),
              ...(query.skip !== undefined ? { skip: query.skip } : {}),
              ...(query.limit !== undefined ? { limit: query.limit } : {}),
            };
      const boards = await getBoardsByWorkspace(req.params.workspaceId, authReq.user.id, options);
      const responseBoards = query.view === 'summary' ? selectFields(boards, query.fields) : boards;
      const hasMore = query.limit !== undefined && boards.length === query.limit;
      res.json({
        boards: responseBoards,
        ...(query.limit !== undefined ? { hasMore } : {}),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            details: error.issues,
          },
        });
        return;
      }
      next(error);
    }
  });
}

export function registerBoardItemReadUpdateRoutes(router: Router): void {
  router.get('/:id', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const query = boardViewQuerySchema.parse(req.query);
      const options = query.view !== undefined ? { view: query.view } : undefined;
      const board = await getBoardById(req.params.id, authReq.user.id, options);
      if (!board) {
        res.status(404).json({
          error: {
            message: 'Board not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }
      const responseBoard = query.view === 'summary' ? selectFields([board], query.fields)[0] : board;
      res.json({ board: responseBoard });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            details: error.issues,
          },
        });
        return;
      }
      next(error);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const validated = updateBoardSchema.parse(req.body);
      const normalizedThemeSettings =
        validated.themeSettings !== undefined
          ? normalizeBoardThemeSettings(validated.themeSettings)
          : undefined;
      const board = await updateBoard(
        req.params.id,
        {
          ...validated,
          ...(normalizedThemeSettings !== undefined ? { themeSettings: normalizedThemeSettings } : {}),
        },
        authReq.user.id,
      );
      if (!board) {
        res.status(404).json({
          error: {
            message: 'Board not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }
      res.json({ board });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            details: error.issues,
          },
        });
        return;
      }
      if (error instanceof Error && error.message.includes('permissions')) {
        res.status(403).json({
          error: {
            message: error.message,
            code: 'FORBIDDEN',
            statusCode: 403,
          },
        });
        return;
      }
      next(error);
    }
  });
}

export function registerBoardDeleteRoute(router: Router): void {
  router.delete('/:id', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const deleted = await deleteBoard(req.params.id, authReq.user.id);
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
      res.json({ message: 'Board deleted successfully' });
    } catch (error) {
      if (error instanceof Error && error.message.includes('owner')) {
        res.status(403).json({
          error: {
            message: error.message,
            code: 'FORBIDDEN',
            statusCode: 403,
          },
        });
        return;
      }
      next(error);
    }
  });
}
