/**
 * User-friendly error message mapper.
 * Converts raw database/API errors to safe user messages without exposing internal details.
 */
export function getUserFriendlyError(error: any): string {
  const message = error?.message?.toLowerCase() || '';
  
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
  
  // Generic fallback - don't expose actual error
  return 'An error occurred. Please try again.';
}
