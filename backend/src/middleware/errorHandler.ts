import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation error') {
    super(400, message);
  }
}

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // App errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
    });
    return;
  }

  // Unknown errors - Always log full stack trace for debugging
  console.error('Unhandled error:', {
    message: err.message,
    name: err.name,
    stack: err.stack,
  });
  
  // Build error response
  const errorResponse: any = {
    error: 'Internal server error',
  };
  
  // Include detailed error information in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.message = err.message;
    
    // Include Prisma error details if it's a Prisma error
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      errorResponse.prismaError = {
        code: err.code,
        meta: err.meta,
        message: err.message,
      };
    } else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
      errorResponse.prismaError = {
        type: 'UnknownRequestError',
        message: err.message,
      };
    } else if (err instanceof Prisma.PrismaClientRustPanicError) {
      errorResponse.prismaError = {
        type: 'RustPanicError',
        message: err.message,
      };
    } else if (err instanceof Prisma.PrismaClientInitializationError) {
      errorResponse.prismaError = {
        type: 'InitializationError',
        message: err.message,
        errorCode: (err as any).errorCode,
      };
    }
  }
  
  res.status(500).json(errorResponse);
}

