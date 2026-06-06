import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { LIST_NAME_MAX_LENGTH } from '../../shared/constants/entityTextLimits.js';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import { parseOrThrow } from '../utils/zodValidation.js';
import { handleApiRouteError } from '../utils/mapServiceErrorToHttp.js';
import type { AuthenticatedRequest } from '../types/express.js';
import {
  createList,
  getListById,
  getListsByBoard,
  updateList,
  deleteList,
  reorderLists,
  moveList,
} from '../services/listService.js';
import { duplicateList } from '../services/listDuplication.js';

const router = Router();

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

const createListSchema = z.object({
  boardId: z.string().min(1),
  name: z.string().min(1).max(LIST_NAME_MAX_LENGTH),
  position: z.number().optional(),
});

const updateListSchema = z.object({
  name: z.string().min(1).max(LIST_NAME_MAX_LENGTH).optional(),
  position: z.number().optional(),
  color: z.string().optional(),
});

const moveListSchema = z.object({
  position: z.number().int().min(0),
});

function handleRouteError(res: Parameters<typeof handleApiRouteError>[0], error: unknown, next: (error: unknown) => void): void {
  handleApiRouteError(res, error, next);
}

// Create list
router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = parseOrThrow(createListSchema, req.body);
    const list = await createList(validated, authReq.user.id);

    res.status(201).json({ list });
  } catch (error) {
    handleRouteError(res, error, next);
  }
});

// Reorder lists — must be registered before `/:id` so `/reorder` is never captured as an id.
router.post('/reorder', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { boardId, listIds } = req.body;
    if (!boardId || !Array.isArray(listIds)) {
      res.status(400).json({
        error: {
          message: 'Invalid request body',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    await reorderLists(boardId, listIds, authReq.user.id);
    res.json({
      message: 'Lists reordered successfully',
      boardId: String(boardId),
      orderedListIds: [...listIds].map((id: unknown) => String(id)),
    });
  } catch (error) {
    handleRouteError(res, error, next);
  }
});

// Move list in board order using fractional `pos`.
router.put('/:id/move', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { position } = parseOrThrow(moveListSchema, req.body);
    const list = await moveList(req.params.id, position, authReq.user.id);
    if (!list) {
      res.status(404).json({
        error: {
          message: 'List not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ list });
  } catch (error) {
    handleRouteError(res, error, next);
  }
});

// Get lists by board
router.get('/board/:boardId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const lists = await getListsByBoard(req.params.boardId, authReq.user.id);
    res.json({ lists });
  } catch (error) {
    handleRouteError(res, error, next);
  }
});

router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const targetBoardId =
      typeof req.body?.targetBoardId === 'string' ? req.body.targetBoardId.trim() : '';
    if (targetBoardId === '') {
      res.status(400).json({
        error: {
          message: 'targetBoardId is required',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    const { list, cards } = await duplicateList(req.params.id, targetBoardId, authReq.user.id);
    res.status(201).json({ list, cards });
  } catch (error) {
    handleRouteError(res, error, next);
  }
});

// Get list by ID
router.get('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const list = await getListById(req.params.id, authReq.user.id);
    if (!list) {
      res.status(404).json({
        error: {
          message: 'List not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ list });
  } catch (error) {
    handleRouteError(res, error, next);
  }
});

// Update list
router.put('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = parseOrThrow(updateListSchema, req.body);
    const list = await updateList(req.params.id, validated, authReq.user.id);
    if (!list) {
      res.status(404).json({
        error: {
          message: 'List not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    res.json({ list });
  } catch (error) {
    handleRouteError(res, error, next);
  }
});

// Delete list
router.delete('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const listId = req.params.id;
    const deleted = await deleteList(listId, authReq.user.id);
    res.status(200).json({
      listId,
      removed: deleted,
      message: deleted ? 'List deleted successfully' : 'List was already deleted',
    });
  } catch (error) {
    handleRouteError(res, error, next);
  }
});

export { router as listRoutes };
