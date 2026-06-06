import { Router } from 'express';
import type { AuthenticatedRequest } from '../../types/express.js';
import { parseOrThrow } from '../../utils/zodValidation.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';
import { importCSV } from '../../services/import/csvImportService.js';
import {
  assertImportDisplayAllowed,
  importCSVSchema,
  importUpload,
  userCanImportCsvToBoard,
} from './_helpers.js';

const router = Router();

// Import CSV/TSV
router.post('/csv', importUpload.single('file'), async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!(await assertImportDisplayAllowed(res, authReq.user.id, authReq.user.isAppAdmin))) {
      return;
    }
    const validated = parseOrThrow(importCSVSchema, req.body);

    const canImportToBoard = await userCanImportCsvToBoard(
      authReq.user.id,
      authReq.user.isAppAdmin,
      validated.boardId,
    );
    if (!canImportToBoard) {
      res.status(404).json({
        error: {
          message: 'Board not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        error: {
          message: 'File is required',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }

    // Start import job (async)
    const jobId = await importCSV(
      req.file.buffer,
      validated.boardId,
      authReq.user.id,
      validated.delimiter,
      validated.defaultUncolouredCardColour,
    );

    res.status(202).json({
      message: 'Import started',
      jobId,
    });
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
});

export { router as importCsvRoutes };
