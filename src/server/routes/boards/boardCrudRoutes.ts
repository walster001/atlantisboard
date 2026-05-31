import { type Router } from 'express';
import type { AuthenticatedRequest } from '../../types/express.js';
import { parseOrThrow } from '../../utils/zodValidation.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';
import {
  createBoard,
  deleteBoard,
  getBoardById,
  getBoardsByWorkspace,
  getUserBoards,
  updateBoard,
} from '../../services/boardService.js';
import { selectFields } from './helpers.js';
import { boardViewQuerySchema, createBoardSchema, updateBoardSchema } from './schemas.js';

export function registerBoardCollectionRoutes(router: Router): void {
  router.post('/', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const validated = parseOrThrow(createBoardSchema, req.body);
      const board = await createBoard({
        ...validated,
        ownerId: authReq.user.id,
      });

      res.status(201).json({ board });
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const workspaceId = req.query.workspaceId as string | undefined;
      const query = parseOrThrow(boardViewQuerySchema, req.query);
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
      handleApiRouteError(res, error, next);
    }
  });

  router.get('/workspace/:workspaceId', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const query = parseOrThrow(boardViewQuerySchema, req.query);
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
      handleApiRouteError(res, error, next);
    }
  });
}

export function registerBoardItemReadUpdateRoutes(router: Router): void {
  router.get('/:id', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const query = parseOrThrow(boardViewQuerySchema, req.query);
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
      handleApiRouteError(res, error, next);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const validated = parseOrThrow(updateBoardSchema, req.body);
      const board = await updateBoard(req.params.id, validated, authReq.user.id);
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
      handleApiRouteError(res, error, next);
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
      handleApiRouteError(res, error, next);
    }
  });
}
