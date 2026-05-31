import {
  NotFoundError,
} from '../../../shared/errors/domainErrors.js';
/**
 * Validates that a list belongs to the expected board (IDOR / enumeration-safe errors).
 */
export function isListOnBoard(listBoardId: unknown, boardId: string): boolean {
  const expected = boardId.trim();
  if (expected === '' || listBoardId == null) {
    return false;
  }
  return String(listBoardId) === expected;
}

/** Throws `List not found` when the list is missing or on a different board (404 at route layer). */
export function assertListOnBoard(listBoardId: unknown, boardId: string): void {
  if (!isListOnBoard(listBoardId, boardId)) {
    throw new NotFoundError('List not found');
  }
}
