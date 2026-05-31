import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../types/express.js';
import { importWekan } from '../../services/import/wekanImportService.js';
import { assertImportJsonMatchesSource } from '../../../shared/import/detectImportJsonSource.js';
import {
  assertImportDisplayAllowed,
  importUpload,
  importWekanSchema,
  parseImportPreflightFromBody,
  respondIfImportJsonShapeError,
  userCanStartBoardJsonImport,
} from './_helpers.js';

const router = Router();

// Import Wekan JSON
router.post('/wekan', importUpload.single('file'), async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!(await assertImportDisplayAllowed(res, authReq.user.id, authReq.user.isAppAdmin))) {
      return;
    }
    const validated = importWekanSchema.parse(req.body);
    {
      const allowed = await userCanStartBoardJsonImport(
        authReq.user.id,
        authReq.user.isAppAdmin,
        'import.wekan',
      );
      if (!allowed) {
        res.status(403).json({
          error: { message: 'Insufficient permissions to import Wekan', code: 'FORBIDDEN', statusCode: 403 },
        });
        return;
      }
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

    // Parse JSON file
    const jsonData = JSON.parse(req.file.buffer.toString('utf-8'));
    try {
      assertImportJsonMatchesSource(jsonData, 'wekan');
    } catch (shapeError) {
      if (respondIfImportJsonShapeError(res, shapeError)) {
        return;
      }
      throw shapeError;
    }
    const preflight = parseImportPreflightFromBody(req.body.preflight);

    // Start import job (async)
    const jobId = await importWekan(
      jsonData,
      authReq.user.id,
      validated.defaultUncolouredCardColour,
      preflight,
    );

    res.status(202).json({
      message: 'Import started',
      jobId,
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
    if (error instanceof SyntaxError) {
      res.status(400).json({
        error: {
          message: 'Invalid JSON file',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    if (error instanceof Error && error.message === 'Invalid preflight payload') {
      res.status(400).json({
        error: {
          message: 'Invalid preflight payload',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    next(error);
  }
});

export { router as importWekanRoutes };
