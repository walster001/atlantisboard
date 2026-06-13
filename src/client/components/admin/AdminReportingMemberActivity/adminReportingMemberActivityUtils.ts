import {
  parseMemberAuditRow,
  type ParsedMemberAuditRow,
} from '../../activities/memberAuditLogParts.js';

export interface ParsedAdminMemberAuditRow extends ParsedMemberAuditRow {
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

export function parseAdminMemberAuditRow(raw: unknown): ParsedAdminMemberAuditRow | null {
  const base = parseMemberAuditRow(raw);
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
