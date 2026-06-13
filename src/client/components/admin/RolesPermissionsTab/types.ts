export type RoleRow = {
  key: string;
  displayName: string;
  description?: string;
  permissions: string[];
  hierarchyLevel: number;
  isBuiltIn: boolean;
};

export type AppAdminRow = {
  readonly _id: string;
  readonly displayName: string;
  readonly email: string;
  readonly profilePicture?: string;
};

export type PermissionCategoryKey =
  | 'workspaces'
  | 'boards'
  | 'board-settings'
  | 'theme-background'
  | 'members'
  | 'columns'
  | 'cards'
  | 'labels'
  | 'attachments'
  | 'comments'
  | 'subtasks'
  | 'invites'
  | 'import'
  | 'export'
  | 'other';

export type CategoryStatus = 'all' | 'some' | 'none';
