/** Known application MongoDB collections shown in Admin → Database. */
export interface ApplicationMongoCollectionMeta {
  readonly label: string;
  readonly description: string;
}

export const APPLICATION_MONGO_COLLECTIONS = {
  activities: {
    label: 'Activities',
    description:
      'Board activity log, member audit log, and legacy workspace activity events (filtered by type in the app). Compliance audit events are log-only, not stored here.',
  },
  adminconfigs: {
    label: 'Admin configuration',
    description: 'Singleton application settings (auth, branding, SMTP, backups, rate limits).',
  },
  backupjobs: {
    label: 'Backup jobs',
    description: 'Backup and restore job progress records (transient; excluded from portable dumps).',
  },
  boardimportplaceholders: {
    label: 'Board import placeholders',
    description: 'Placeholder users created while mapping Trello/Wekan imports to local accounts.',
  },
  boardlabels: {
    label: 'Board labels',
    description: 'Reusable label definitions scoped to a board.',
  },
  boards: {
    label: 'Boards',
    description: 'Kanban boards, members, and board-level settings (including activity log toggles).',
  },
  cards: {
    label: 'Cards',
    description: 'Cards with embedded comments, checklists, attachments, and reminders.',
  },
  importjobs: {
    label: 'Import jobs',
    description: 'Trello/Wekan/CSV import job status and error details.',
  },
  invitelinks: {
    label: 'Invite links',
    description: 'Workspace and board invite tokens (one-time or recurring).',
  },
  lists: {
    label: 'Lists',
    description: 'Kanban columns/lists belonging to a board.',
  },
  notifications: {
    label: 'Notifications',
    description: 'In-app notifications for assignments, mentions, invites, and reminders.',
  },
  permissionsets: {
    label: 'Permission sets',
    description: 'Custom permission bundles assigned to roles.',
  },
  roledefinitions: {
    label: 'Role definitions',
    description: 'Named roles and their permission assignments.',
  },
  sessions: {
    label: 'Sessions',
    description: 'Express session documents (Redis-backed; MongoDB mirror for connect-redis).',
  },
  themes: {
    label: 'Board themes',
    description: 'Shared board theme palettes (collection name themes).',
  },
  users: {
    label: 'Users',
    description: 'User accounts, preferences, and embedded custom theme definitions.',
  },
  workspaces: {
    label: 'Workspaces',
    description: 'Workspace containers, members, and workspace-level activity retention settings.',
  },
} as const satisfies Record<string, ApplicationMongoCollectionMeta>;

export type ApplicationMongoCollectionName = keyof typeof APPLICATION_MONGO_COLLECTIONS;

export function listApplicationMongoCollectionNames(): readonly ApplicationMongoCollectionName[] {
  return (Object.keys(APPLICATION_MONGO_COLLECTIONS) as ApplicationMongoCollectionName[]).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function applicationMongoCollectionMeta(
  name: string,
): ApplicationMongoCollectionMeta | undefined {
  return (APPLICATION_MONGO_COLLECTIONS as Record<string, ApplicationMongoCollectionMeta>)[name];
}
