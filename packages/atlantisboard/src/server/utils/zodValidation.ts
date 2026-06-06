import type { Response } from 'express';
import { z } from 'zod';

export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  return schema.parse(input);
}

export function respondZodValidationError(res: Response, error: unknown): error is z.ZodError {
  if (!(error instanceof z.ZodError)) {
    return false;
  }
  res.status(400).json({
    error: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details: error.issues,
    },
  });
  return true;
}
