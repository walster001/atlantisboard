import {
  parseBoardActivityRow,
  type ParsedBoardActivityRow,
} from '../../activities/boardActivityLogParts.js';

export interface ParsedAdminBoardActivityRow extends ParsedBoardActivityRow {
  readonly boardId: string;
  readonly boardName: string;
}

function readBoardId(raw: Record<string, unknown>): string {
  const boardId = raw.boardId;
  if (typeof boardId === 'string' && boardId.trim() !== '') {
    return boardId.trim();
  }
  if (boardId != null && typeof boardId === 'object' && !Array.isArray(boardId)) {
    const id = (boardId as { _id?: unknown })._id;
    if (typeof id === 'string' && id.trim() !== '') {
      return id.trim();
    }
  }
  return '';
}

export function parseAdminBoardActivityRow(raw: unknown): ParsedAdminBoardActivityRow | null {
  const base = parseBoardActivityRow(raw);
  if (base == null) {
    return null;
  }
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const boardId = readBoardId(record);
  const boardNameRaw = record.boardName;
  const boardName =
    typeof boardNameRaw === 'string' && boardNameRaw.trim() !== ''
      ? boardNameRaw.trim()
      : 'Untitled board';
  return {
    ...base,
    boardId,
    boardName,
  };
}
