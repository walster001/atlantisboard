import { Router } from 'express';
import type { AuthenticatedRequest } from '../../types/express.js';
import { parseOrThrow } from '../../utils/zodValidation.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';
import { importAtlantisboard } from '../../services/import/atlantisboardImportService/index.js';
import { hasWorkspacePermission } from '../../utils/permissions.js';
import {
  assertAtlantisboardExportShape,
  AtlantisboardExportShapeError,
} from '../../../shared/import/atlantisboardNormalize.js';
import {
  assertImportDisplayAllowed,
  importAtlantisboardSchema,
  importUpload,
  userCanStartAtlantisboardImport,
} from './_helpers.js';

const router = Router();

// Import native Atlantisboard JSON
router.post('/atlantisboard', importUpload.single('file'), async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!(await assertImportDisplayAllowed(res, authReq.user.id, authReq.user.isAppAdmin))) {
      return;
    }
    const validated = parseOrThrow(importAtlantisboardSchema, req.body);
    if (typeof validated.workspaceId === 'string' && validated.workspaceId.trim() !== '') {
      const allowed =
        authReq.user.isAppAdmin === true ||
        (await hasWorkspacePermission(authReq.user.id, validated.workspaceId, 'import.atlantisboard'));
      if (!allowed) {
        res.status(403).json({
          error: { message: 'Insufficient permissions to import board', code: 'FORBIDDEN', statusCode: 403 },
        });
        return;
      }
    } else {
      const allowed = await userCanStartAtlantisboardImport(authReq.user.id, authReq.user.isAppAdmin);
      if (!allowed) {
        res.status(403).json({
          error: { message: 'Insufficient permissions to import board', code: 'FORBIDDEN', statusCode: 403 },
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

    const jsonData = JSON.parse(req.file.buffer.toString('utf-8'));
    try {
      assertAtlantisboardExportShape(jsonData);
    } catch (shapeError) {
      if (shapeError instanceof AtlantisboardExportShapeError) {
        res.status(400).json({
          error: {
            message: shapeError.message,
            code: 'IMPORT_WRONG_JSON_SOURCE',
            statusCode: 400,
          },
        });
        return;
      }
      throw shapeError;
    }

    const jobId = await importAtlantisboard(
      jsonData,
      authReq.user.id,
      validated.workspaceId,
    );

    res.status(202).json({
      message: 'Import started',
      jobId,
    });
  } catch (error) {
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
    handleApiRouteError(res, error, next);
  }
});

export { router as importAtlantisboardRoutes };
