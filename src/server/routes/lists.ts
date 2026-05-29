import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { LIST_NAME_MAX_LENGTH } from '../../shared/constants/entityTextLimits.js';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../shared/types/express.js';
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

// Create list
router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = createListSchema.parse(req.body);
    const list = await createList(validated, authReq.user.id);

    res.status(201).json({ list });
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

// Move list in board order using fractional `pos`.
router.put('/:id/move', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { position } = moveListSchema.parse(req.body);
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

// Get lists by board
router.get('/board/:boardId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const lists = await getListsByBoard(req.params.boardId, authReq.user.id);
    res.json({ lists });
  } catch (error) {
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
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: {
          message: error.message,
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    next(error);
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

// Update list
router.put('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = updateListSchema.parse(req.body);
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

export { router as listRoutes };

