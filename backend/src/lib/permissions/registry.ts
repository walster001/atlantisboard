/**
 * Permission Registry
 * 
 * This file defines the permission metadata and default role mappings.
 * Matches the frontend permission system exactly.
 */

import {
  PermissionKey,
  BoardRole,
  APP_PERMISSIONS,
} from './types.js';

/**
 * Default permission sets for each role.
 * These represent the CURRENT behavior and will be used for legacy role fallback.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<BoardRole, Set<PermissionKey>> = {
  admin: new Set([
    // All board-level permissions
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
    
    // All member management permissions
    'board.members.view',
    'board.members.add',
    'board.members.remove',
    'board.members.role.change',
    'board.invite.create',
    'board.invite.delete',
    
    // All column permissions
    'column.create',
    'column.edit',
    'column.delete',
    'column.reorder',
    'column.color.edit',
    
    // All card permissions
    'card.create',
    'card.edit',
    'card.delete',
    'card.move',
    'card.color.edit',
    'card.duedate.edit',
    
    // All label permissions
    'label.create',
    'label.edit',
    'label.delete',
    'label.assign',
    'label.unassign',
    
    // All attachment permissions
    'attachment.view',
    'attachment.upload',
    'attachment.download',
    'attachment.delete',
    
    // All subtask permissions
    'subtask.view',
    'subtask.create',
    'subtask.toggle',
    'subtask.delete',
  ]),

  manager: new Set([
    // Board access
    'board.view',
    'board.settings.button',
    'board.settings.members',
    
    // Member management (limited - can only add/remove viewers)
    'board.members.view',
    'board.members.add',    // Note: Server enforces "viewers only" for managers
    'board.members.remove', // Note: Server enforces "viewers only" for managers
    'board.invite.create',
    'board.invite.delete',
    
    // View-only permissions
    'attachment.view',
    'attachment.download',
    'subtask.view',
  ]),

  viewer: new Set([
    // Read-only access
    'board.view',
    'board.members.view',
    'attachment.view',
    'attachment.download',
    'subtask.view',
  ]),
};

/**
 * App-level permissions that require isAppAdmin flag
 * These are checked separately from board role
 */
export const APP_ADMIN_PERMISSIONS: Set<PermissionKey> = new Set([
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
]);

/**
 * Check if a permission is app-level (requires isAppAdmin)
 */
export function isAppPermission(permission: PermissionKey): boolean {
  return APP_ADMIN_PERMISSIONS.has(permission);
}

