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

/** Map legacy service throws that still use message substring checks. */
function mapLegacyServiceError(error: Error): ServiceErrorBody | null {
  const message = error.message;

  if (
    message.includes('Invalid invite') ||
    message.includes('expired') ||
    message.includes('already been used')
  ) {
    return domainErrorBody(new BadRequestError(message, 'INVALID_INVITE'));
  }
  if (message.includes('Invalid board order')) {
    return domainErrorBody(new BadRequestError(message, 'INVALID_REORDER'));
  }
  if (message === 'List not found on board') {
    return domainErrorBody(new BadRequestError(message, 'BAD_REQUEST'));
  }
  if (message.includes('already')) {
    return domainErrorBody(new ConflictError(message));
  }
  if (
    message.includes('Access denied') ||
    message.includes('permissions') ||
    message.includes('Only board admins') ||
    message.includes('Only admins') ||
    message.includes('Cannot remove') ||
    message.includes('Cannot change') ||
    message.includes('owner') ||
    message.includes('Role update exceeds') ||
    message.includes('Cannot assign')
  ) {
    return domainErrorBody(new ForbiddenError(message));
  }
  if (message.includes('not found') || message.includes('Not found')) {
    return domainErrorBody(new NotFoundError(message));
  }
  if (
    message.includes('exceeds maximum') ||
    message.includes('Maximum') ||
    message.includes('malware') ||
    message.includes('security scan') ||
    message.includes('Validation') ||
    message.includes('Invalid role hierarchy')
  ) {
    return domainErrorBody(new ValidationError(message));
  }
  if (message.includes('Invalid')) {
    return domainErrorBody(new ValidationError(message));
  }
  return null;
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
 * Writes a JSON error response when `error` is a typed domain error or a known legacy throw.
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
  if (error instanceof Error) {
    const legacy = mapLegacyServiceError(error);
    if (legacy != null) {
      res.status(legacy.error.statusCode).json(legacy);
      return true;
    }
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
