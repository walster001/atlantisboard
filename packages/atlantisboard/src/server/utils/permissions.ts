/**
 * Permission utility functions for role-based access control.
 * Thin barrel re-exporting the public API from focused modules.
 */

export type {
  AuthUser,
  PermissionContext,
  RoleKey,
  UserRole,
} from './permissionsShared.js';

export {
  hasWorkspacePermission,
  getUserWorkspaceRole,
  isWorkspaceMember,
  userCanCreateWorkspace,
  userCanReorganizeWorkspaceHomeBoardBucket,
  userCanUseImportDisplay,
  userHasPermissionInAnyWorkspace,
} from './permissionsWorkspace.js';

export {
  getUserBoardRole,
  hasPermission,
  isBoardMember,
} from './permissionsBoard.js';
