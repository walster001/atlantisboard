/**
 * Permission UI Types
 */

import { PermissionKey } from '@/lib/permissions/types';

export interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface RolePermission {
  id: string;
  role_id: string | null;
  permission_key: PermissionKey;
  created_at: string;
}

export interface PermissionCategoryConfig {
  id: string;
  name: string;
  icon: string;
  permissions: {
    key: PermissionKey;
    description: string;
  }[];
}

export type CategoryStatus = 'on' | 'partial' | 'off';

export interface BuiltInRole {
  id: 'app-admin' | 'admin' | 'manager' | 'viewer';
  name: string;
  description: string;
  isAppLevel?: boolean;
}

// App Admin is a special role that shows user management, not granular permissions
export const BUILT_IN_ROLES: BuiltInRole[] = [
  { id: 'app-admin', name: 'App Admin', description: 'Global administrators with full access to all features and settings', isAppLevel: true },
  { id: 'admin', name: 'Board Admin', description: 'Board-level administration: manages board settings, members, and all board content' },
  { id: 'manager', name: 'Manager', description: 'Can manage members, create invites, and view board settings' },
  { id: 'viewer', name: 'Viewer', description: 'Read-only access to board content and attachments' },
];

// Permission categories with their permissions
export const PERMISSION_CATEGORIES: PermissionCategoryConfig[] = [
  {
    id: 'app-admin',
    name: 'App Administration',
    icon: 'Settings',
    permissions: [
      { key: 'app.admin.access', description: 'Access admin configuration panel' },
      { key: 'app.admin.branding.view', description: 'View branding settings' },
      { key: 'app.admin.branding.edit', description: 'Edit branding settings' },
      { key: 'app.admin.fonts.view', description: 'View custom fonts' },
      { key: 'app.admin.fonts.edit', description: 'Manage custom fonts' },
      { key: 'app.admin.login.view', description: 'View login settings' },
      { key: 'app.admin.login.edit', description: 'Edit login settings' },
    ],
  },
  {
    id: 'themes',
    name: 'Themes',
    icon: 'Palette',
    permissions: [
      { key: 'app.themes.create', description: 'Create new themes' },
      { key: 'app.themes.edit', description: 'Edit existing themes' },
      { key: 'app.themes.delete', description: 'Delete themes' },
    ],
  },
  {
    id: 'workspaces',
    name: 'Workspaces',
    icon: 'LayoutGrid',
    permissions: [
      { key: 'app.workspace.create', description: 'Create new workspaces' },
      { key: 'app.workspace.edit', description: 'Edit workspace settings' },
      { key: 'app.workspace.delete', description: 'Delete workspaces' },
    ],
  },
  {
    id: 'boards',
    name: 'Boards',
    icon: 'Trello',
    permissions: [
      { key: 'app.board.create', description: 'Create new boards' },
      { key: 'app.board.import', description: 'Import boards from external sources' },
      { key: 'board.view', description: 'View boards' },
      { key: 'board.edit', description: 'Edit board details' },
      { key: 'board.delete', description: 'Delete boards' },
      { key: 'board.move', description: 'Move boards between workspaces' },
    ],
  },
  {
    id: 'board-settings',
    name: 'Board Settings',
    icon: 'Settings2',
    permissions: [
      { key: 'board.settings.button', description: 'Access board settings button' },
      { key: 'board.settings.members', description: 'Access members settings tab' },
      { key: 'board.settings.theme', description: 'Access theme settings tab' },
      { key: 'board.settings.labels', description: 'Access labels settings tab' },
      { key: 'board.settings.audit', description: 'Access audit log tab' },
      { key: 'board.background.edit', description: 'Change board background' },
      { key: 'board.theme.assign', description: 'Assign themes to boards' },
    ],
  },
  {
    id: 'members',
    name: 'Members',
    icon: 'Users',
    permissions: [
      { key: 'board.members.view', description: 'View board members' },
      { key: 'board.members.add', description: 'Add new members to boards' },
      { key: 'board.members.remove', description: 'Remove members from boards' },
      { key: 'board.members.role.change', description: 'Change member roles' },
      { key: 'board.invite.create', description: 'Create invite links' },
      { key: 'board.invite.delete', description: 'Delete invite links' },
    ],
  },
  {
    id: 'columns',
    name: 'Columns',
    icon: 'Columns3',
    permissions: [
      { key: 'column.create', description: 'Create new columns' },
      { key: 'column.edit', description: 'Edit column titles' },
      { key: 'column.delete', description: 'Delete columns' },
      { key: 'column.reorder', description: 'Reorder columns' },
      { key: 'column.color.edit', description: 'Change column colors' },
    ],
  },
  {
    id: 'cards',
    name: 'Cards',
    icon: 'StickyNote',
    permissions: [
      { key: 'card.create', description: 'Create new cards' },
      { key: 'card.edit', description: 'Edit card content' },
      { key: 'card.delete', description: 'Delete cards' },
      { key: 'card.move', description: 'Move cards between columns' },
      { key: 'card.color.edit', description: 'Change card colors' },
      { key: 'card.duedate.edit', description: 'Set and edit due dates' },
    ],
  },
  {
    id: 'labels',
    name: 'Labels',
    icon: 'Tag',
    permissions: [
      { key: 'label.create', description: 'Create new labels' },
      { key: 'label.edit', description: 'Edit label names and colors' },
      { key: 'label.delete', description: 'Delete labels' },
      { key: 'label.assign', description: 'Assign labels to cards' },
      { key: 'label.unassign', description: 'Remove labels from cards' },
    ],
  },
  {
    id: 'attachments',
    name: 'Attachments',
    icon: 'Paperclip',
    permissions: [
      { key: 'attachment.view', description: 'View attachments' },
      { key: 'attachment.upload', description: 'Upload attachments' },
      { key: 'attachment.download', description: 'Download attachments' },
      { key: 'attachment.delete', description: 'Delete attachments' },
    ],
  },
  {
    id: 'subtasks',
    name: 'Subtasks',
    icon: 'CheckSquare',
    permissions: [
      { key: 'subtask.view', description: 'View subtasks' },
      { key: 'subtask.create', description: 'Create subtasks' },
      { key: 'subtask.toggle', description: 'Toggle subtask completion' },
      { key: 'subtask.delete', description: 'Delete subtasks' },
    ],
  },
];

// Board-level permission categories (excludes app-level permissions)
export const BOARD_LEVEL_CATEGORIES = PERMISSION_CATEGORIES.filter(
  c => !['app-admin', 'themes', 'workspaces'].includes(c.id) && 
       !c.permissions.some(p => p.key.startsWith('app.'))
);

// Get only board-level permissions (no app.* permissions)
const getBoardLevelPermissions = () => {
  return PERMISSION_CATEGORIES
    .flatMap(c => c.permissions.map(p => p.key))
    .filter(key => !key.startsWith('app.'));
};

// Default permissions for built-in roles
export const BUILT_IN_ROLE_PERMISSIONS: Record<string, Set<PermissionKey>> = {
  // App Admin has ALL permissions (handled specially in UI - shows user list, not toggles)
  'app-admin': new Set(PERMISSION_CATEGORIES.flatMap(c => c.permissions.map(p => p.key))),
  // Board Admin has all BOARD-LEVEL permissions (not app-level)
  admin: new Set(getBoardLevelPermissions()),
  manager: new Set([
    'board.view',
    'board.settings.button',
    'board.settings.members',
    'board.members.view',
    'board.members.add',
    'board.members.remove',
    'board.invite.create',
    'board.invite.delete',
    'attachment.view',
    'attachment.download',
    'subtask.view',
  ]),
  viewer: new Set([
    'board.view',
    'board.members.view',
    'attachment.view',
    'attachment.download',
    'subtask.view',
  ]),
};
