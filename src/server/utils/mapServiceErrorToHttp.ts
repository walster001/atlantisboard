import type { Response } from 'express';
import {
  DomainError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  BadRequestError,
} from '../../shared/errors/domainErrors.js';
import {
  ImportJsonSourceMismatchError,
  ImportJsonUnrecognizedError,
} from '../../shared/import/detectImportJsonSource.js';
import { respondZodValidationError } from './zodValidation.js';

export interface ServiceErrorBody {
  readonly error: {
    readonly message: string;
    readonly code: string;
    readonly statusCode: number;
    readonly details?: unknown;
  };
}

function domainErrorBody(error: DomainError): ServiceErrorBody {
  return {
    error: {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      ...(error instanceof ValidationError && error.details !== undefined
        ? { details: error.details }
        : {}),
    },
  };
}

function mapImportJsonError(error: unknown): ServiceErrorBody | null {
  if (error instanceof ImportJsonSourceMismatchError) {
    return {
      error: {
        message: error.message,
        code: 'IMPORT_WRONG_JSON_SOURCE',
        statusCode: 400,
      },
    };
  }
  if (error instanceof ImportJsonUnrecognizedError) {
    return {
      error: {
        message: error.message,
        code: 'IMPORT_JSON_UNRECOGNIZED',
        statusCode: 400,
      },
    };
  }
  return null;
}

/**
 * Writes a JSON error response when `error` is a typed domain error or a known import JSON throw.
 * Returns true when a response was sent.
 */
export function mapServiceErrorToHttp(res: Response, error: unknown): boolean {
  const importJson = mapImportJsonError(error);
  if (importJson != null) {
    res.status(importJson.error.statusCode).json(importJson);
    return true;
  }
  if (error instanceof DomainError) {
    res.status(error.statusCode).json(domainErrorBody(error));
    return true;
  }
  return false;
}

/** Standard route catch: Zod validation, then domain/legacy service errors, then `next`. */
export function handleApiRouteError(
  res: Response,
  error: unknown,
  next: (error: unknown) => void,
): void {
  if (respondZodValidationError(res, error)) {
    return;
  }
  if (mapServiceErrorToHttp(res, error)) {
    return;
  }
  next(error);
}

export {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  BadRequestError,
};
