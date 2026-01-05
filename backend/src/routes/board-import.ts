import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { permissionService } from '../lib/permissions/service.js';
import { boardImportService } from '../services/board-import.service.js';
import { getErrorMessage, isError, isRecord } from '../lib/typeGuards.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Wekan data can be a single board object or an array of boards
// We use unknown here and validate in the service layer since Wekan data structure is complex
const importBoardSchema = z.object({
  wekanData: z.unknown(), // Wekan board data (can be single board or array) - validated in service layer
  defaultCardColor: z.string().nullable().optional(),
  iconReplacements: z.record(z.string(), z.string()).optional(), // Map of original URL -> replacement URL
}).passthrough(); // Allow extra fields without throwing - supports future extensibility

router.post('/import', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  
  // Check if streaming is requested early
  const useStreaming = req.query.stream === 'true';
  
  console.log('[POST /boards/import] Request received:', {
    useStreaming,
    userId: authReq.userId,
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
  });
  
  // Helper to send error via SSE if streaming, otherwise use next()
  const handleError = (error: unknown) => {
    try {
      const errorMessage = getErrorMessage(error);
      const errorName = isError(error) ? error.name : undefined;
      const errorType = isRecord(error) && 'constructor' in error && isRecord(error.constructor) && 'name' in error.constructor ? String(error.constructor.name) : undefined;
      
      console.error('[POST /boards/import] Handling error:', {
        error: errorMessage,
        useStreaming,
        headersSent: res.headersSent,
        errorName: errorName,
        errorType: errorType,
      });
      
      if (useStreaming) {
        // If streaming, send error via SSE with 200 status (SSE requires 200)
        if (!res.headersSent) {
          try {
            res.status(200); // SSE requires 200 status
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
          } catch (headerError) {
            console.error('[POST /boards/import] Failed to set SSE headers:', headerError);
            // If we can't set headers, try standard error handling
            if (!res.headersSent) {
              next(error);
            }
            return;
          }
        }
        
        const errorResult = {
          type: 'result',
          success: false,
          errors: [errorMessage],
          workspaces_created: 0,
          boards_created: 0,
          columns_created: 0,
          cards_created: 0,
          labels_created: 0,
          subtasks_created: 0,
          warnings: [],
        };
        
        try {
          res.write(`data: ${JSON.stringify(errorResult)}\n\n`);
          res.end();
        } catch (writeError) {
          console.error('[POST /boards/import] Failed to write error to SSE stream:', writeError);
          try {
            res.end();
          } catch (endError) {
            console.error('[POST /boards/import] Failed to end response:', endError);
          }
        }
      } else {
        // If not streaming, use standard error handling
        next(error);
      }
    } catch (handleErrorError) {
      // If handleError itself fails, log and use standard error handling
      console.error('[POST /boards/import] Error in handleError:', handleErrorError);
      if (!res.headersSent) {
        next(error);
      }
    }
  };

  try {
    // Check admin permission
    try {
      const context = permissionService.buildContext(authReq.userId, authReq.user.isAdmin);
      await permissionService.requirePermission('app.admin.access', context);
    } catch (permissionError: unknown) {
      // Handle permission errors via SSE if streaming
      handleError(permissionError);
      return;
    }

    // Validate request body with permissive schema
    let validated;
    try {
      validated = importBoardSchema.parse(req.body);
    } catch (validationError: unknown) {
      // Handle Zod validation errors with user-friendly messages
      if (validationError instanceof z.ZodError) {
        const errorMessages = validationError.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        const error = new ValidationError(`Invalid import data: ${errorMessages}`);
        handleError(error);
        return;
      }
      handleError(validationError);
      return;
    }

    const { wekanData, defaultCardColor, iconReplacements } = validated;

    if (!wekanData) {
      const error = new ValidationError('No Wekan data provided');
      handleError(error);
      return;
    }

   // If streaming is enabled, use SSE
    if (useStreaming) {
      res.status(200); // SSE requires 200 status
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

      const sendProgress = (update: { type: 'progress'; stage: string; current: number; total: number; detail?: string; createdIds?: { workspaceId?: string; boardIds?: string[] } }) => {
        res.write(`data: ${JSON.stringify(update)}\n\n`);
      };

      const sendResult = (result: Record<string, unknown>) => {
        res.write(`data: ${JSON.stringify(result)}\n\n`);
        res.end();
      };

      try {
        await boardImportService.importWekanBoard(
          authReq.userId,
          wekanData,
          defaultCardColor || null,
          sendProgress,
          sendResult,
          iconReplacements || {}
        );
      } catch (error: unknown) {
        // Ensure SSE stream is properly closed on errors
        const errorMessage = getErrorMessage(error);
        const errorStack = isError(error) ? error.stack : undefined;
        const errorName = isError(error) ? error.name : undefined;
        const errorType = isRecord(error) && 'constructor' in error && isRecord(error.constructor) && 'name' in error.constructor ? String(error.constructor.name) : undefined;
        console.error('[POST /boards/import] Import service error:', {
          error: errorMessage,
          stack: errorStack,
          userId: authReq.userId,
          errorName: errorName,
          errorType: errorType,
        });
        
        // Check if result was already sent
        if (!res.headersSent) {
          sendResult({
            type: 'result',
            success: false,
            errors: [errorMessage],
            workspaces_created: 0,
            boards_created: 0,
            columns_created: 0,
            cards_created: 0,
            labels_created: 0,
            subtasks_created: 0,
            warnings: [],
          });
        } else {
          // Headers already sent, try to send error via stream
          try {
            res.write(`data: ${JSON.stringify({
              type: 'result',
              success: false,
              errors: [errorMessage],
              workspaces_created: 0,
              boards_created: 0,
              columns_created: 0,
              cards_created: 0,
              labels_created: 0,
              subtasks_created: 0,
              warnings: [],
            })}\n\n`);
            res.end();
          } catch (writeError) {
            console.error('[POST /boards/import] Failed to write error to stream:', writeError);
            res.end();
          }
        }
      }
    } else {
      // Non-streaming fallback
      const result = await boardImportService.importWekanBoard(
        authReq.userId!,
        wekanData,
        defaultCardColor || null,
        undefined,
        undefined,
        iconReplacements || {}
      );
      res.json(result);
    }
  } catch (error: unknown) {
    // Log validation and other errors for debugging
    if (error instanceof ValidationError || error instanceof z.ZodError) {
      console.error('[POST /boards/import] Validation error:', {
        error: error.message,
        userId: authReq.userId,
      });
    } else {
      console.error('[POST /boards/import] Unexpected error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId: authReq.userId,
      });
    }
    handleError(error);
  }
});

export default router;

