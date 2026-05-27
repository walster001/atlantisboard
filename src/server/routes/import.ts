import { Router, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../shared/types/express.js';
import { importAtlantisboard } from '../services/import/atlantisboardImportService/index.js';
import { importTrello } from '../services/import/trelloImportService.js';
import { importWekan } from '../services/import/wekanImportService.js';
import { importCSV } from '../services/import/csvImportService.js';
import { ImportJob } from '../models/ImportJob.js';
import multer from 'multer';
import { getBoardImportUploadMaxBytes } from '../constants/uploads.js';
import { Workspace } from '../models/Workspace.js';
import { Board } from '../models/Board.js';
import { hasPermission, userCanUseImportDisplay } from '../utils/permissions.js';
import { importPreflightPayloadSchema } from '../../shared/import/importPreflightSchema.js';
import {
  assertImportJsonMatchesSource,
  ImportJsonSourceMismatchError,
} from '../../shared/import/detectImportJsonSource.js';
import {
  assertAtlantisboardExportShape,
  AtlantisboardExportShapeError,
} from '../../shared/import/atlantisboardNormalize.js';

const router = Router();
const importUploadMaxBytes = getBoardImportUploadMaxBytes();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: importUploadMaxBytes },
});

router.use(requireAuth as RequestHandler);
router.use(apiRateLimiter);

const optionalDefaultUncolouredCardColour = z
  .union([z.literal(''), z.string().regex(/^#[0-9A-Fa-f]{6}$/)])
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : v));

const importTrelloSchema = z.object({
  workspaceId: z.string().optional(),
  defaultUncolouredCardColour: optionalDefaultUncolouredCardColour,
});

const importWekanSchema = z.object({
  defaultUncolouredCardColour: optionalDefaultUncolouredCardColour,
});

function parseImportPreflightFromBody(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return importPreflightPayloadSchema.parse(parsed);
  } catch {
    throw new Error('Invalid preflight payload');
  }
}

const importCSVSchema = z.object({
  boardId: z.string().min(1),
  delimiter: z.enum([',', '\t']).optional().default(','),
  defaultUncolouredCardColour: optionalDefaultUncolouredCardColour,
});

function respondIfImportJsonShapeError(res: Response, error: unknown): boolean {
  if (error instanceof ImportJsonSourceMismatchError) {
    res.status(400).json({
      error: {
        message: error.message,
        code: 'IMPORT_WRONG_JSON_SOURCE',
        statusCode: 400,
      },
    });
    return true;
  }
  if (
    error instanceof Error &&
    (error.message.includes('Could not tell') || error.message.includes('must contain a JSON object'))
  ) {
    res.status(400).json({
      error: {
        message: error.message,
        code: 'IMPORT_JSON_UNRECOGNIZED',
        statusCode: 400,
      },
    });
    return true;
  }
  return false;
}

async function assertImportDisplayAllowed(
  res: Response,
  userId: string,
  isAppAdmin: boolean | undefined,
): Promise<boolean> {
  const allowed = await userCanUseImportDisplay(userId, isAppAdmin);
  if (!allowed) {
    res.status(403).json({
      error: {
        message: 'Insufficient permissions to use import',
        code: 'FORBIDDEN',
        statusCode: 403,
      },
    });
    return false;
  }
  return true;
}

async function userHasWorkspaceImportPermission(
  userId: string,
  permissionKey: 'import.trello' | 'import.wekan',
): Promise<boolean> {
  const workspaces = await Workspace.find({
    $or: [{ ownerId: userId }, { 'members.userId': userId }],
  })
    .select('_id')
    .lean();
  for (const workspace of workspaces) {
    const allowed = await hasPermission(userId, String(workspace._id), permissionKey, 'workspace');
    if (allowed) {
      return true;
    }
  }
  return false;
}

const importAtlantisboardSchema = z.object({
  workspaceId: z.string().optional(),
});

async function userCanStartAtlantisboardImport(
  userId: string,
  isAppAdmin: boolean | undefined,
): Promise<boolean> {
  if (isAppAdmin === true) {
    return true;
  }
  const [canTrello, canWekan] = await Promise.all([
    userHasWorkspaceImportPermission(userId, 'import.trello'),
    userHasWorkspaceImportPermission(userId, 'import.wekan'),
  ]);
  return canTrello || canWekan;
}

async function userCanStartBoardJsonImport(
  userId: string,
  isAppAdmin: boolean | undefined,
  permissionKey: 'import.trello' | 'import.wekan',
): Promise<boolean> {
  if (isAppAdmin === true) {
    return true;
  }
  return userHasWorkspaceImportPermission(userId, permissionKey);
}

/** Board-scoped import authorization for CSV (404 when board missing or not allowed — AC-012). */
async function userCanImportCsvToBoard(
  userId: string,
  isAppAdmin: boolean | undefined,
  boardId: string,
): Promise<boolean> {
  if (isAppAdmin === true) {
    return true;
  }

  const board = await Board.findById(boardId).select('workspaceId ownerId').lean();
  if (!board) {
    return false;
  }

  if (board.ownerId?.toString() === userId) {
    return true;
  }

  const [canTrelloOnBoard, canWekanOnBoard] = await Promise.all([
    hasPermission({ id: userId }, boardId, 'import.trello'),
    hasPermission({ id: userId }, boardId, 'import.wekan'),
  ]);
  if (canTrelloOnBoard || canWekanOnBoard) {
    return true;
  }

  const workspaceId = board.workspaceId?.toString();
  if (workspaceId != null && workspaceId !== '') {
    const [canTrelloWs, canWekanWs] = await Promise.all([
      hasPermission(userId, workspaceId, 'import.trello', 'workspace'),
      hasPermission(userId, workspaceId, 'import.wekan', 'workspace'),
    ]);
    if (canTrelloWs || canWekanWs) {
      return true;
    }
  }

  return false;
}

// Import Trello JSON
router.post('/trello', upload.single('file'), async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!(await assertImportDisplayAllowed(res, authReq.user.id, authReq.user.isAppAdmin))) {
      return;
    }
    const validated = importTrelloSchema.parse(req.body);
    if (typeof validated.workspaceId === 'string' && validated.workspaceId.trim() !== '') {
      const allowed =
        authReq.user.isAppAdmin === true ||
        (await hasPermission(authReq.user.id, validated.workspaceId, 'import.trello', 'workspace'));
      if (!allowed) {
        res.status(403).json({
          error: { message: 'Insufficient permissions to import Trello', code: 'FORBIDDEN', statusCode: 403 },
        });
        return;
      }
    } else {
      const allowed = await userCanStartBoardJsonImport(
        authReq.user.id,
        authReq.user.isAppAdmin,
        'import.trello',
      );
      if (!allowed) {
        res.status(403).json({
          error: { message: 'Insufficient permissions to import Trello', code: 'FORBIDDEN', statusCode: 403 },
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
      assertImportJsonMatchesSource(jsonData, 'trello');
    } catch (shapeError) {
      if (respondIfImportJsonShapeError(res, shapeError)) {
        return;
      }
      throw shapeError;
    }
    const preflight = parseImportPreflightFromBody(req.body.preflight);

    // Start import job (async)
    const jobId = await importTrello(
      jsonData,
      authReq.user.id,
      validated.workspaceId,
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

// Import Wekan JSON
router.post('/wekan', upload.single('file'), async (req, res, next) => {
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

// Import native Atlantisboard JSON
router.post('/atlantisboard', upload.single('file'), async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!(await assertImportDisplayAllowed(res, authReq.user.id, authReq.user.isAppAdmin))) {
      return;
    }
    const validated = importAtlantisboardSchema.parse(req.body);
    if (typeof validated.workspaceId === 'string' && validated.workspaceId.trim() !== '') {
      const allowed =
        authReq.user.isAppAdmin === true ||
        (await hasPermission(authReq.user.id, validated.workspaceId, 'import.trello', 'workspace')) ||
        (await hasPermission(authReq.user.id, validated.workspaceId, 'import.wekan', 'workspace'));
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
    next(error);
  }
});

// Import CSV/TSV
router.post('/csv', upload.single('file'), async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!(await assertImportDisplayAllowed(res, authReq.user.id, authReq.user.isAppAdmin))) {
      return;
    }
    const validated = importCSVSchema.parse(req.body);

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

// Get import job status
router.get('/jobs/:jobId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const job = await ImportJob.findById(req.params.jobId);
    
    if (!job) {
      res.status(404).json({
        error: {
          message: 'Import job not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    // Check ownership
    if (job.userId.toString() !== authReq.user.id) {
      res.status(403).json({
        error: {
          message: 'Access denied',
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }

    res.json({ job });
  } catch (error) {
    next(error);
  }
});

export { router as importRoutes };

