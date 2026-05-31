import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import { handleApiRouteError } from '../utils/mapServiceErrorToHttp.js';
import type { AuthenticatedRequest } from '../types/express.js';
import {
  BOARD_EXPORT_FORMAT_EXTENSIONS,
  isBoardExportFormat,
} from '../../shared/export/boardExportFormats.js';
import { exportBoardAsCSV, exportBoardPayload, type BoardJsonExportFormat } from '../services/export/boardExportService.js';
import {
  loadBoardExportContext,
  sanitizeBoardExportFilename,
} from '../services/export/loadBoardExportContext.js';

const router = Router();

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

async function sendJsonBoardExport(
  req: import('express').Request,
  res: import('express').Response,
  next: (error: unknown) => void,
  format: BoardJsonExportFormat,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const ctx = await loadBoardExportContext(req.params.boardId, authReq.user.id, format);
    const payload = await exportBoardPayload(req.params.boardId, authReq.user.id, format);
    const filename = sanitizeBoardExportFilename(
      ctx.board.name,
      BOARD_EXPORT_FORMAT_EXTENSIONS[format],
    );
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(payload);
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
}

async function sendCsvBoardExport(
  req: import('express').Request,
  res: import('express').Response,
  next: (error: unknown) => void,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const columns = req.query.columns
      ? (req.query.columns as string).split(',').map((c) => c.trim())
      : undefined;
    const ctx = await loadBoardExportContext(req.params.boardId, authReq.user.id, 'csv');
    const csv = await exportBoardAsCSV(req.params.boardId, authReq.user.id, columns);
    const filename = sanitizeBoardExportFilename(ctx.board.name, 'csv');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
}

router.get('/boards/:boardId/json', async (req, res, next) => {
  await sendJsonBoardExport(req, res, next, 'atlantisboard');
});

router.get('/boards/:boardId/csv', async (req, res, next) => {
  await sendCsvBoardExport(req, res, next);
});

router.get('/boards/:boardId/:format', async (req, res, next) => {
  const formatRaw = req.params.format;
  if (!isBoardExportFormat(formatRaw)) {
    res.status(400).json({
      error: {
        message: 'Invalid export format',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      },
    });
    return;
  }

  if (formatRaw === 'csv') {
    await sendCsvBoardExport(req, res, next);
    return;
  }

  await sendJsonBoardExport(req, res, next, formatRaw);
});

export { router as exportRoutes };
