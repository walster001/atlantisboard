import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

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
  // Log error for debugging (server-side only)
  logger.error({
    err,
    message: err.message,
    stack: err.stack,
  });

  // Don't expose sensitive error information to clients
  const statusCode = err.statusCode || 500;
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


