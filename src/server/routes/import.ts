import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../shared/types/express.js';
import { importTrello } from '../services/import/trelloImportService.js';
import { importWekan } from '../services/import/wekanImportService.js';
import { importCSV } from '../services/import/csvImportService.js';
import { ImportJob } from '../models/ImportJob.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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

const importCSVSchema = z.object({
  boardId: z.string().min(1),
  delimiter: z.enum([',', '\t']).optional().default(','),
  defaultUncolouredCardColour: optionalDefaultUncolouredCardColour,
});

// Import Trello JSON
router.post('/trello', upload.single('file'), async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = importTrelloSchema.parse(req.body);

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

    // Start import job (async)
    const jobId = await importTrello(
      jsonData,
      authReq.user.id,
      validated.workspaceId,
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

// Import Wekan JSON
router.post('/wekan', upload.single('file'), async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validated = importWekanSchema.parse(req.body);

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

    // Start import job (async)
    const jobId = await importWekan(
      jsonData,
      authReq.user.id,
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
    const validated = importCSVSchema.parse(req.body);

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

