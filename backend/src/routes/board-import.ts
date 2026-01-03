/**
 * Board Import Routes - Wekan Board Import
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { permissionService } from '../lib/permissions/service.js';
import { boardImportService } from '../services/board-import.service.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

const importBoardSchema = z.object({
  wekanData: z.any(), // Wekan board data (can be single board or array)
  defaultCardColor: z.string().nullable().optional(),
}).passthrough(); // Allow extra fields without throwing - supports future extensibility

/**
 * POST /api/boards/import
 * Import Wekan board(s)
 * Supports SSE streaming via ?stream=true query parameter
 */
router.post('/import', async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  
  // Check if streaming is requested early
  const useStreaming = req.query.stream === 'true';
  
  console.log('[POST /boards/import] Request received:', {
    useStreaming,
    userId: authReq.userId,
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
  });
  
  // Helper to send error via SSE if streaming, otherwise use next()
  const handleError = (error: any) => {
    try {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('[POST /boards/import] Handling error:', {
        error: errorMessage,
        useStreaming,
        headersSent: res.headersSent,
        errorName: error.name,
        errorType: error.constructor?.name,
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
      const context = permissionService.buildContext(authReq.userId!, authReq.user?.isAdmin ?? false);
      await permissionService.requirePermission('app.admin.access', context);
    } catch (permissionError: any) {
      // Handle permission errors via SSE if streaming
      handleError(permissionError);
      return;
    }

    // Validate request body with permissive schema
    let validated;
    try {
      validated = importBoardSchema.parse(req.body);
    } catch (validationError: any) {
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

    const { wekanData, defaultCardColor } = validated;

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

      const sendProgress = (update: any) => {
        res.write(`data: ${JSON.stringify(update)}\n\n`);
      };

      const sendResult = (result: any) => {
        res.write(`data: ${JSON.stringify(result)}\n\n`);
        res.end();
      };

      try {
        await boardImportService.importWekanBoard(
          authReq.userId!,
          wekanData,
          defaultCardColor || null,
          sendProgress,
          sendResult
        );
      } catch (error: any) {
        // Ensure SSE stream is properly closed on errors
        const errorMessage = error.message || 'Board import encountered an error. Some data may not have been imported.';
        console.error('[POST /boards/import] Import service error:', {
          error: errorMessage,
          stack: error.stack,
          userId: authReq.userId,
          errorName: error.name,
          errorType: error.constructor?.name,
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
        defaultCardColor || null
      );
      res.json(result);
    }
  } catch (error) {
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

