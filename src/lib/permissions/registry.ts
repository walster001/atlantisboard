/**
 * Permission Registry
 * 
 * This file defines the permission metadata and default role mappings.
 * These mappings represent the CURRENT behavior that will be preserved
 * during migration to granular permissions.
 */

import {
  PermissionKey,
  PermissionMetadata,
  BoardRole,
} from './types';

// Permission metadata for UI display and documentation
export const PERMISSION_METADATA: Record<PermissionKey, PermissionMetadata> = {
  // Application-level permissions
  'app.admin.access': {
    key: 'app.admin.access',
    label: 'Access Admin Panel',
    description: 'Access the admin configuration panel',
    category: 'application',
    requiresBoardContext: false,
  },
  'app.admin.branding.view': {
    key: 'app.admin.branding.view',
    label: 'View Branding Settings',
    description: 'View login and app branding configuration',
    category: 'application',
    requiresBoardContext: false,
  },
  'app.admin.branding.edit': {
    key: 'app.admin.branding.edit',
    label: 'Edit Branding Settings',
    description: 'Modify login and app branding configuration',
    category: 'application',
    requiresBoardContext: false,
  },
  'app.admin.fonts.view': {
    key: 'app.admin.fonts.view',
    label: 'View Custom Fonts',
    description: 'View uploaded custom fonts',
    category: 'application',
    requiresBoardContext: false,
  },
  'app.admin.fonts.edit': {
    key: 'app.admin.fonts.edit',
    label: 'Manage Custom Fonts',
    description: 'Upload and delete custom fonts',
    category: 'application',
    requiresBoardContext: false,
  },
  'app.admin.login.view': {
    key: 'app.admin.login.view',
    label: 'View Login Options',
    description: 'View authentication configuration',
    category: 'application',
    requiresBoardContext: false,
  },
  'app.admin.login.edit': {
    key: 'app.admin.login.edit',
    label: 'Edit Login Options',
    description: 'Modify authentication configuration',
    category: 'application',
    requiresBoardContext: false,
  },
  'app.themes.create': {
    key: 'app.themes.create',
    label: 'Create Themes',
    description: 'Create new board themes',
    category: 'application',
    requiresBoardContext: false,
  },
  'app.themes.edit': {
    key: 'app.themes.edit',
    label: 'Edit Themes',
    description: 'Modify existing board themes',
    category: 'application',
    requiresBoardContext: false,
  },
  'app.themes.delete': {
    key: 'app.themes.delete',
    label: 'Delete Themes',
    description: 'Delete custom board themes',
    category: 'application',
    requiresBoardContext: false,
  },
  'app.workspace.create': {
    key: 'app.workspace.create',
    label: 'Create Workspaces',
    description: 'Create new workspaces',
    category: 'application',
    requiresBoardContext: false,
  },
  'app.workspace.edit': {
    key: 'app.workspace.edit',
    label: 'Edit Workspaces',
    description: 'Rename and edit workspace descriptions',
    category: 'application',
    requiresBoardContext: false,
  },
  'app.workspace.delete': {
    key: 'app.workspace.delete',
    label: 'Delete Workspaces',
    description: 'Delete workspaces and all contained boards',
    category: 'application',
    requiresBoardContext: false,
  },
  'app.board.create': {
    key: 'app.board.create',
    label: 'Create Boards',
    description: 'Create new boards in workspaces',
    category: 'application',
    requiresBoardContext: false,
  },
  'app.board.import': {
    key: 'app.board.import',
    label: 'Import Boards',
    description: 'Import boards from external sources',
    category: 'application',
    requiresBoardContext: false,
  },

  // Board-level permissions
  'board.view': {
    key: 'board.view',
    label: 'View Board',
    description: 'View board and its contents',
    category: 'board',
    requiresBoardContext: true,
  },
  'board.edit': {
    key: 'board.edit',
    label: 'Edit Board',
    description: 'Edit board name and description',
    category: 'board',
    requiresBoardContext: true,
  },
  'board.delete': {
    key: 'board.delete',
    label: 'Delete Board',
    description: 'Permanently delete the board',
    category: 'board',
    requiresBoardContext: true,
  },
  'board.move': {
    key: 'board.move',
    label: 'Move Board',
    description: 'Move board between workspaces',
    category: 'board',
    requiresBoardContext: true,
  },
  'board.settings.button': {
    key: 'board.settings.button',
    label: 'Settings Button',
    description: 'See the board settings button',
    category: 'board',
    requiresBoardContext: true,
  },
  'board.settings.members': {
    key: 'board.settings.members',
    label: 'Members Tab',
    description: 'Access the members tab in board settings',
    category: 'board',
    requiresBoardContext: true,
  },
  'board.settings.theme': {
    key: 'board.settings.theme',
    label: 'Theme Settings',
    description: 'Access theme and background settings',
    category: 'board',
    requiresBoardContext: true,
  },
  'board.settings.labels': {
    key: 'board.settings.labels',
    label: 'Label Settings',
    description: 'Access label management',
    category: 'board',
    requiresBoardContext: true,
  },
  'board.settings.audit': {
    key: 'board.settings.audit',
    label: 'View Audit Log',
    description: 'View board audit log',
    category: 'board',
    requiresBoardContext: true,
  },
  'board.background.edit': {
    key: 'board.background.edit',
    label: 'Edit Background',
    description: 'Change board background color or image',
    category: 'board',
    requiresBoardContext: true,
  },
  'board.theme.assign': {
    key: 'board.theme.assign',
    label: 'Assign Theme',
    description: 'Assign a theme to the board',
    category: 'board',
    requiresBoardContext: true,
  },

  // Member management permissions
  'board.members.view': {
    key: 'board.members.view',
    label: 'View Members',
    description: 'View board member list',
    category: 'members',
    requiresBoardContext: true,
  },
  'board.members.add': {
    key: 'board.members.add',
    label: 'Add Members',
    description: 'Add new members to the board',
    category: 'members',
    requiresBoardContext: true,
  },
  'board.members.remove': {
    key: 'board.members.remove',
    label: 'Remove Members',
    description: 'Remove members from the board',
    category: 'members',
    requiresBoardContext: true,
  },
  'board.members.role.change': {
    key: 'board.members.role.change',
    label: 'Change Roles',
    description: 'Change member roles on the board',
    category: 'members',
    requiresBoardContext: true,
  },
  'board.invite.create': {
    key: 'board.invite.create',
    label: 'Create Invites',
    description: 'Generate invite links',
    category: 'members',
    requiresBoardContext: true,
  },
  'board.invite.delete': {
    key: 'board.invite.delete',
    label: 'Delete Invites',
    description: 'Revoke invite links',
    category: 'members',
    requiresBoardContext: true,
  },

  // Column permissions
  'column.create': {
    key: 'column.create',
    label: 'Create Columns',
    description: 'Add new columns to the board',
    category: 'columns',
    requiresBoardContext: true,
  },
  'column.edit': {
    key: 'column.edit',
    label: 'Edit Columns',
    description: 'Edit column titles',
    category: 'columns',
    requiresBoardContext: true,
  },
  'column.delete': {
    key: 'column.delete',
    label: 'Delete Columns',
    description: 'Delete columns and their cards',
    category: 'columns',
    requiresBoardContext: true,
  },
  'column.reorder': {
    key: 'column.reorder',
    label: 'Reorder Columns',
    description: 'Drag to reorder columns',
    category: 'columns',
    requiresBoardContext: true,
  },
  'column.color.edit': {
    key: 'column.color.edit',
    label: 'Edit Column Color',
    description: 'Change column background color',
    category: 'columns',
    requiresBoardContext: true,
  },

  // Card permissions
  'card.create': {
    key: 'card.create',
    label: 'Create Cards',
    description: 'Add new cards to columns',
    category: 'cards',
    requiresBoardContext: true,
  },
  'card.edit': {
    key: 'card.edit',
    label: 'Edit Cards',
    description: 'Edit card title and description',
    category: 'cards',
    requiresBoardContext: true,
  },
  'card.delete': {
    key: 'card.delete',
    label: 'Delete Cards',
    description: 'Delete cards',
    category: 'cards',
    requiresBoardContext: true,
  },
  'card.move': {
    key: 'card.move',
    label: 'Move Cards',
    description: 'Drag cards between columns',
    category: 'cards',
    requiresBoardContext: true,
  },
  'card.color.edit': {
    key: 'card.color.edit',
    label: 'Edit Card Color',
    description: 'Change card background color',
    category: 'cards',
    requiresBoardContext: true,
  },
  'card.duedate.edit': {
    key: 'card.duedate.edit',
    label: 'Edit Due Date',
    description: 'Set or clear card due dates',
    category: 'cards',
    requiresBoardContext: true,
  },

  // Label permissions
  'label.create': {
    key: 'label.create',
    label: 'Create Labels',
    description: 'Create new labels',
    category: 'labels',
    requiresBoardContext: true,
  },
  'label.edit': {
    key: 'label.edit',
    label: 'Edit Labels',
    description: 'Edit label name and color',
    category: 'labels',
    requiresBoardContext: true,
  },
  'label.delete': {
    key: 'label.delete',
    label: 'Delete Labels',
    description: 'Delete labels',
    category: 'labels',
    requiresBoardContext: true,
  },
  'label.assign': {
    key: 'label.assign',
    label: 'Assign Labels',
    description: 'Assign labels to cards',
    category: 'labels',
    requiresBoardContext: true,
  },
  'label.unassign': {
    key: 'label.unassign',
    label: 'Unassign Labels',
    description: 'Remove labels from cards',
    category: 'labels',
    requiresBoardContext: true,
  },

  // Attachment permissions
  'attachment.view': {
    key: 'attachment.view',
    label: 'View Attachments',
    description: 'View card attachments',
    category: 'attachments',
    requiresBoardContext: true,
  },
  'attachment.upload': {
    key: 'attachment.upload',
    label: 'Upload Attachments',
    description: 'Upload files to cards',
    category: 'attachments',
    requiresBoardContext: true,
  },
  'attachment.download': {
    key: 'attachment.download',
    label: 'Download Attachments',
    description: 'Download card attachments',
    category: 'attachments',
    requiresBoardContext: true,
  },
  'attachment.delete': {
    key: 'attachment.delete',
    label: 'Delete Attachments',
    description: 'Delete card attachments',
    category: 'attachments',
    requiresBoardContext: true,
  },

  // Subtask permissions
  'subtask.view': {
    key: 'subtask.view',
    label: 'View Subtasks',
    description: 'View card checklists',
    category: 'subtasks',
    requiresBoardContext: true,
  },
  'subtask.create': {
    key: 'subtask.create',
    label: 'Create Subtasks',
    description: 'Add checklist items',
    category: 'subtasks',
    requiresBoardContext: true,
  },
  'subtask.toggle': {
    key: 'subtask.toggle',
    label: 'Toggle Subtasks',
    description: 'Mark subtasks complete/incomplete',
    category: 'subtasks',
    requiresBoardContext: true,
  },
  'subtask.delete': {
    key: 'subtask.delete',
    label: 'Delete Subtasks',
    description: 'Delete checklist items',
    category: 'subtasks',
    requiresBoardContext: true,
  },
};

/**
 * Default permission sets for each role.
 * These represent the CURRENT behavior and will be used for legacy role fallback.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<BoardRole, Set<PermissionKey>> = {
  admin: new Set([
    // All app-level permissions (requires isAppAdmin flag)
    // Admins at board level don't automatically get app-level permissions
    
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
    'board.settings.button',  // Can see the settings button
    'board.settings.members', // Can access the members tab
    
    // Member management (limited - can only add/remove viewers)
    'board.members.view',
    'board.members.add',    // Note: Server enforces "viewers only" for managers
    'board.members.remove', // Note: Server enforces "viewers only" for managers
    'board.invite.create',  // Can create invite links
    'board.invite.delete',  // Can delete invite links
    
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
 * Get permissions by category for UI grouping
 */
export function getPermissionsByCategory(): Record<string, PermissionMetadata[]> {
  const result: Record<string, PermissionMetadata[]> = {};
  
  for (const metadata of Object.values(PERMISSION_METADATA)) {
    if (!result[metadata.category]) {
      result[metadata.category] = [];
    }
    result[metadata.category].push(metadata);
  }
  
  return result;
}

/**
 * Check if a permission requires board context
 */
export function requiresBoardContext(permission: PermissionKey): boolean {
  return PERMISSION_METADATA[permission]?.requiresBoardContext ?? true;
}
