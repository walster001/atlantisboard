/**
 * Type guard to check if an unknown value is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Safely extracts error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'An unknown error occurred';
}

/**
 * Safely extracts error name from unknown error type
 */
export function getErrorName(error: unknown): string | undefined {
  if (isError(error)) {
    return error.name;
  }
  if (error && typeof error === 'object' && 'name' in error) {
    return String(error.name);
  }
  return undefined;
}

/**
 * User-friendly error message mapper.
 * Converts raw database/API errors to safe user messages without exposing internal details.
 */
export function getUserFriendlyError(error: unknown): string {
  const message = getErrorMessage(error).toLowerCase();
  
  // Map specific database errors to user-friendly messages
  if (message.includes('row-level security')) {
    return 'You do not have permission to perform this action.';
  }
  if (message.includes('duplicate key') || message.includes('unique constraint')) {
    return 'This item already exists.';
  }
  if (message.includes('foreign key')) {
    return 'Cannot complete action: this item is linked to other data.';
  }
  if (message.includes('not-null constraint')) {
    return 'A required field is missing.';
  }
  if (message.includes('violates check constraint')) {
    return 'The provided value is not valid.';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'Network error. Please check your connection.';
  }
  if (message.includes('timeout')) {
    return 'Request timed out. Please try again.';
  }
  if (message.includes('too many requests') || message.includes('rate limit')) {
    const errorMessage = getErrorMessage(error);
    return errorMessage !== 'An unknown error occurred' ? errorMessage : 'Too many requests. Please wait a moment and try again.';
  }
  
  // Generic fallback - don't expose actual error
  return 'An error occurred. Please try again.';
}
