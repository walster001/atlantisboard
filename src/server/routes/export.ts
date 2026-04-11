import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../shared/types/express.js';
import { exportBoard, exportBoardAsCSV } from '../services/export/boardExportService.js';

const router = Router();

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

// Export board as JSON
router.get('/boards/:boardId/json', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const data = await exportBoard(req.params.boardId, authReq.user.id);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="board-${req.params.boardId}.json"`);
    res.json(data);
  } catch (error) {
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
    if (error instanceof Error && error.message.includes('Access denied')) {
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

// Export board as CSV
router.get('/boards/:boardId/csv', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const columns = req.query.columns 
      ? (req.query.columns as string).split(',').map((c) => c.trim())
      : undefined;
    const csv = await exportBoardAsCSV(req.params.boardId, authReq.user.id, columns);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="board-${req.params.boardId}.csv"`);
    res.send(csv);
  } catch (error) {
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
    if (error instanceof Error && error.message.includes('Access denied')) {
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

export { router as exportRoutes };

