/**
 * Detect Trello vs Wekan JSON exports so the wrong importer cannot run.
 * Heuristics match the shapes accepted by trelloNormalize / wekanImportService.
 */

import { isAtlantisboardExportShape } from './atlantisboardNormalize.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Unwrap the same root shapes importers accept (`data`, `{ board }` without `boards`).
 */
export function unwrapImportJsonRoot(raw: unknown): Record<string, unknown> | null {
  let r = asRecord(raw);
  if (r == null) {
    return null;
  }
  const dataObj = asRecord(r.data);
  if (dataObj != null) {
    r = dataObj;
  }
  const boardObj = asRecord(r.board);
  if (boardObj != null && !Array.isArray(r.boards)) {
    return { ...r, boards: [boardObj] } as Record<string, unknown>;
  }
  return r;
}

function sampleList(o: Record<string, unknown>): Record<string, unknown> | null {
  if (Array.isArray(o.lists) && o.lists.length > 0) {
    return asRecord(o.lists[0]);
  }
  if (Array.isArray(o.boards) && o.boards.length > 0) {
    const b = asRecord(o.boards[0]);
    if (b != null && Array.isArray(b.lists) && b.lists.length > 0) {
      return asRecord(b.lists[0]);
    }
  }
  return null;
}

function sampleCard(o: Record<string, unknown>): Record<string, unknown> | null {
  if (Array.isArray(o.cards) && o.cards.length > 0) {
    return asRecord(o.cards[0]);
  }
  if (Array.isArray(o.boards) && o.boards.length > 0) {
    const b = asRecord(o.boards[0]);
    if (b != null && Array.isArray(b.cards) && b.cards.length > 0) {
      return asRecord(b.cards[0]);
    }
  }
  return null;
}

/** Board row: first of `boards[]`, or root when it already looks like a board document. */
function sampleBoard(o: Record<string, unknown>): Record<string, unknown> | null {
  if (Array.isArray(o.boards) && o.boards.length > 0) {
    return asRecord(o.boards[0]);
  }
  const hasListsOrCards = Array.isArray(o.lists) || Array.isArray(o.cards);
  if (hasListsOrCards && (typeof o.id === 'string' || str(o._id) != null)) {
    return o;
  }
  return null;
}

export class ImportJsonUnrecognizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportJsonUnrecognizedError';
  }
}

export class ImportJsonSourceMismatchError extends Error {
  readonly expected: 'trello' | 'wekan';
  readonly detected: 'trello' | 'wekan';

  constructor(message: string, expected: 'trello' | 'wekan', detected: 'trello' | 'wekan') {
    super(message);
    this.name = 'ImportJsonSourceMismatchError';
    this.expected = expected;
    this.detected = detected;
  }
}

/**
 * Returns which JSON import pipeline matches this payload.
 * @throws Error if the payload is not a usable object or is too ambiguous / empty.
 */
export function detectImportJsonSource(raw: unknown): 'trello' | 'wekan' {
  const o = unwrapImportJsonRoot(raw);
  if (o == null) {
    throw new ImportJsonUnrecognizedError('Import file must contain a JSON object.');
  }

  const format = str(o._format)?.toLowerCase() ?? '';
  if (format.includes('wekan')) {
    return 'wekan';
  }

  const card = sampleCard(o);
  if (card != null) {
    if (typeof card.idList === 'string' && card.idList.length > 0) {
      return 'trello';
    }
    if (typeof card.listId === 'string' && card.listId.length > 0 && card.idList == null) {
      return 'wekan';
    }
  }

  const list = sampleList(o);
  if (list != null) {
    if (typeof list.idBoard === 'string' && list.idBoard.length > 0 && typeof list.id === 'string') {
      return 'trello';
    }
    if (
      typeof list.boardId === 'string' &&
      list.boardId.length > 0 &&
      str(list._id) != null &&
      list.idBoard == null
    ) {
      return 'wekan';
    }
  }

  const board = sampleBoard(o);
  if (board != null) {
    const trelloId = typeof board.id === 'string' && board.id.length > 0;
    const wekanId = str(board._id) != null;
    const trelloName = typeof board.name === 'string' && board.name.length > 0;
    const wekanTitle = typeof board.title === 'string' && board.title.length > 0;

    if (trelloId && trelloName && !wekanTitle) {
      return 'trello';
    }
    if (wekanId && wekanTitle && !trelloName) {
      return 'wekan';
    }
    if (trelloId && !wekanId) {
      return 'trello';
    }
    if (wekanId && !trelloId) {
      return 'wekan';
    }
  }

  if (Array.isArray(o.organizations) && o.organizations.length > 0) {
    return 'trello';
  }

  throw new ImportJsonUnrecognizedError(
    'Could not tell if this file is Trello or Wekan JSON. Open it in a text editor: Trello exports use fields like "id", "idBoard", and "idList"; Wekan exports use "_id", "boardId", and "listId".',
  );
}

export function assertImportJsonMatchesSource(raw: unknown, expected: 'trello' | 'wekan'): void {
  if (isAtlantisboardExportShape(raw)) {
    throw new ImportJsonSourceMismatchError(
      'This JSON is an Atlantisboard board export. Choose “Atlantisboard JSON” as the import source.',
      expected,
      expected === 'trello' ? 'wekan' : 'trello',
    );
  }
  const detected = detectImportJsonSource(raw);
  if (detected !== expected) {
    const msg =
      expected === 'trello'
        ? 'This JSON looks like a Wekan export (e.g. listId / _id). Choose “Wekan JSON”, or use a Trello-exported JSON file.'
        : 'This JSON looks like a Trello export (e.g. idList / idBoard). Choose “Trello JSON”, or use a Wekan-exported JSON file.';
    throw new ImportJsonSourceMismatchError(msg, expected, detected);
  }
}
