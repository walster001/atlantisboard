import type { AdminBoardListReportRow } from '../../../../shared/types/adminReporting.js';

export const ADMIN_BOARD_LIST_ROW_PX = 52;
export const ADMIN_BOARD_LIST_VIRTUOSO_VIEWPORT_PAD = { top: 48, bottom: 120 } as const;
export const ADMIN_BOARD_LIST_VIRTUOSO_OVERSCAN = 10;

export const ADMIN_BOARD_LIST_NAME_COL_PX = 220;
export const ADMIN_BOARD_LIST_WORKSPACE_COL_PX = 180;
export const ADMIN_BOARD_LIST_OWNER_COL_PX = 180;
export const ADMIN_BOARD_LIST_MEMBERS_COL_PX = 88;
export const ADMIN_BOARD_LIST_VISIBILITY_COL_PX = 112;
export const ADMIN_BOARD_LIST_POSITION_COL_PX = 88;
export const ADMIN_BOARD_LIST_DATE_COL_PX = 168;
export const ADMIN_BOARD_LIST_ACTION_COL_PX = 112;

export type AdminBoardListRow = AdminBoardListReportRow;

export function formatReportingDateTime(value: string | undefined): string {
  if (value == null || value.trim() === '') {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }
  return parsed.toLocaleString();
}

export function formatBoardVisibility(
  visibility: AdminBoardListReportRow['visibility'],
): string {
  switch (visibility) {
    case 'private':
      return 'Private';
    case 'workspace':
      return 'Workspace';
    case 'public':
      return 'Public';
    default:
      return visibility;
  }
}

export function formatBoardOwner(row: AdminBoardListReportRow): string {
  if (row.ownerDisplayName != null && row.ownerDisplayName.trim() !== '') {
    return row.ownerDisplayName.trim();
  }
  return row.ownerId;
}

export function formatBoardWorkspace(row: AdminBoardListReportRow): string {
  if (row.workspaceName != null && row.workspaceName.trim() !== '') {
    return row.workspaceName.trim();
  }
  if (row.workspaceId != null && row.workspaceId.trim() !== '') {
    return row.workspaceId.trim();
  }
  return '-';
}

export function parseAdminBoardListRow(raw: unknown): AdminBoardListRow | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const id = record._id;
  const name = record.name;
  const ownerId = record.ownerId;
  const visibility = record.visibility;
  const memberCount = record.memberCount;
  const position = record.position;
  const createdAt = record.createdAt;
  const updatedAt = record.updatedAt;

  if (typeof id !== 'string' || id.trim() === '') {
    return null;
  }
  if (typeof name !== 'string') {
    return null;
  }
  if (typeof ownerId !== 'string' || ownerId.trim() === '') {
    return null;
  }
  if (visibility !== 'private' && visibility !== 'workspace' && visibility !== 'public') {
    return null;
  }
  if (typeof memberCount !== 'number' || !Number.isFinite(memberCount)) {
    return null;
  }
  if (typeof position !== 'number' || !Number.isFinite(position)) {
    return null;
  }
  if (typeof createdAt !== 'string' || createdAt.trim() === '') {
    return null;
  }
  if (typeof updatedAt !== 'string' || updatedAt.trim() === '') {
    return null;
  }

  const workspaceIdRaw = record.workspaceId;
  const workspaceNameRaw = record.workspaceName;
  const ownerDisplayNameRaw = record.ownerDisplayName;

  return {
    _id: id.trim(),
    name: name.trim() !== '' ? name.trim() : 'Untitled board',
    ownerId: ownerId.trim(),
    memberCount,
    visibility,
    position,
    createdAt: createdAt.trim(),
    updatedAt: updatedAt.trim(),
    ...(typeof workspaceIdRaw === 'string' && workspaceIdRaw.trim() !== ''
      ? { workspaceId: workspaceIdRaw.trim() }
      : {}),
    ...(typeof workspaceNameRaw === 'string' && workspaceNameRaw.trim() !== ''
      ? { workspaceName: workspaceNameRaw.trim() }
      : {}),
    ...(typeof ownerDisplayNameRaw === 'string' && ownerDisplayNameRaw.trim() !== ''
      ? { ownerDisplayName: ownerDisplayNameRaw.trim() }
      : {}),
  };
}
