import type { Response } from 'express';
import {
  DomainError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/domainErrors.js';

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
  if (message.includes('permissions')) {
    return domainErrorBody(new ForbiddenError(message));
  }
  if (message.includes('not found') || message.includes('Not found')) {
    return domainErrorBody(new NotFoundError(message));
  }
  if (message.includes('Validation') || message.includes('Invalid') || message.includes('Maximum')) {
    return domainErrorBody(new ValidationError(message));
  }
  return null;
}

/**
 * Writes a JSON error response when `error` is a typed domain error or a known legacy throw.
 * Returns true when a response was sent.
 */
export function mapServiceErrorToHttp(res: Response, error: unknown): boolean {
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

export { ForbiddenError, NotFoundError, ValidationError };
