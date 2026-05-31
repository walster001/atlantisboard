import { Request, Response, NextFunction } from 'express';
import { mapServiceErrorToHttp } from '../utils/mapServiceErrorToHttp.js';
import { logger } from '../utils/logger.js';
import { respondZodValidationError } from '../utils/zodValidation.js';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) {
    return;
  }

  // Log error for debugging (server-side only)
  logger.error({
    err,
    message: err.message,
    stack: err.stack,
  });

  // Mirror handleApiRouteError for routes that pass through via next(error)
  if (respondZodValidationError(res, err)) {
    return;
  }
  if (mapServiceErrorToHttp(res, err)) {
    return;
  }

  // Don't expose sensitive error information to clients
  const statusCode =
    typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
  const message =
    statusCode === 500
      ? 'Internal server error'
      : err.message || 'An error occurred';

  res.status(statusCode).json({
    error: {
      message,
      code: err.code || 'INTERNAL_ERROR',
      statusCode,
    },
  });
}


