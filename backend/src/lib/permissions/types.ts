/**
 * Permission System Types
 * 
 * This file defines all permission keys and their associated types.
 * Matches the frontend permission system exactly.
 */

// Board role types (matches database enum)
export type BoardRole = 'admin' | 'manager' | 'viewer';

// Application-level permissions (not board-specific)
export const APP_PERMISSIONS = [
  'app.admin.access',
  'app.admin.branding.view',
  'app.admin.branding.edit',
  'app.admin.fonts.view',
  'app.admin.fonts.edit',
  'app.admin.login.view',
  'app.admin.login.edit',
  'app.themes.create',
  'app.themes.edit',
  'app.themes.delete',
  'app.workspace.create',
  'app.workspace.edit',
  'app.workspace.delete',
  'app.board.create',
  'app.board.import',
] as const;

// Board-level permissions (require boardId context)
export const BOARD_PERMISSIONS = [
  'board.view',
  'board.edit',
  'board.delete',
  'board.move',
  'board.settings.button',
  'board.settings.members',
  'board.settings.theme',
  'board.settings.labels',
  'board.settings.audit',
  'board.background.edit',
  'board.theme.assign',
] as const;

// Member management permissions
export const MEMBER_PERMISSIONS = [
  'board.members.view',
  'board.members.add',
  'board.members.remove',
  'board.members.role.change',
  'board.invite.create',
  'board.invite.delete',
] as const;

// Column permissions
export const COLUMN_PERMISSIONS = [
  'column.create',
  'column.edit',
  'column.delete',
  'column.reorder',
  'column.color.edit',
] as const;

// Card permissions
export const CARD_PERMISSIONS = [
  'card.create',
  'card.edit',
  'card.delete',
  'card.move',
  'card.color.edit',
  'card.duedate.edit',
] as const;

// Label permissions
export const LABEL_PERMISSIONS = [
  'label.create',
  'label.edit',
  'label.delete',
  'label.assign',
  'label.unassign',
] as const;

// Attachment permissions
export const ATTACHMENT_PERMISSIONS = [
  'attachment.view',
  'attachment.upload',
  'attachment.download',
  'attachment.delete',
] as const;

// Subtask permissions
export const SUBTASK_PERMISSIONS = [
  'subtask.view',
  'subtask.create',
  'subtask.toggle',
  'subtask.delete',
] as const;

// All permission keys combined
export const ALL_PERMISSIONS = [
  ...APP_PERMISSIONS,
  ...BOARD_PERMISSIONS,
  ...MEMBER_PERMISSIONS,
  ...COLUMN_PERMISSIONS,
  ...CARD_PERMISSIONS,
  ...LABEL_PERMISSIONS,
  ...ATTACHMENT_PERMISSIONS,
  ...SUBTASK_PERMISSIONS,
] as const;

// Permission key type (union of all permission strings)
export type PermissionKey = typeof ALL_PERMISSIONS[number];

// App-level permission key type
export type AppPermissionKey = typeof APP_PERMISSIONS[number];

// Board-level permission key type (requires boardId)
export type BoardPermissionKey = Exclude<PermissionKey, AppPermissionKey>;

// Permission context for checking
export interface PermissionContext {
  userId: string;
  isAppAdmin: boolean;
  boardId?: string;
  boardRole?: BoardRole | null;
}

