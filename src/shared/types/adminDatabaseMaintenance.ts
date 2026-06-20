/** Cleanup targets exposed in Admin Configuration → Database. */
export const DATABASE_CLEANUP_CATEGORY_IDS = [
  'stale-import-jobs',
  'stale-backup-jobs',
  'expired-sessions',
  'expired-notifications',
  'orphan-lists',
  'orphan-cards-no-board',
  'orphan-cards-no-list',
  'orphan-board-labels',
  'orphan-boards-no-workspace',
  'orphan-activities-no-board',
  'orphan-activities-no-card',
  'orphan-board-import-placeholders',
  'orphan-invite-links',
  'orphan-notifications-no-user',
  'orphan-notifications-no-board',
  'orphan-notifications-no-card',
  'orphan-import-jobs-no-user',
] as const;

export type DatabaseCleanupCategoryId = (typeof DATABASE_CLEANUP_CATEGORY_IDS)[number];

export interface DatabaseCollectionStat {
  readonly name: string;
  readonly documentCount: number;
  readonly knownToApp: boolean;
  /** Friendly label when the collection is part of the application schema. */
  readonly label?: string;
  /** What the collection stores (known collections only). */
  readonly description?: string;
}

export interface DatabaseCleanupCategorySnapshot {
  readonly id: DatabaseCleanupCategoryId;
  readonly label: string;
  readonly description: string;
  readonly count: number;
  /** When true, the admin UI may offer one-click delete without extra confirmation beyond the dialog. */
  readonly safeToDelete: boolean;
}

/** JSON from `GET /api/v1/admin/database/stats`. */
export interface AdminDatabaseMaintenanceSnapshot {
  readonly generatedAt: string;
  readonly databaseName: string;
  readonly mongoVersion: string | null;
  readonly dataSizeMb: number | null;
  readonly storageSizeMb: number | null;
  readonly totalDocuments: number;
  readonly collections: readonly DatabaseCollectionStat[];
  readonly cleanupCategories: readonly DatabaseCleanupCategorySnapshot[];
}

export interface DatabaseCleanupCategoryResult {
  readonly id: DatabaseCleanupCategoryId;
  readonly deletedCount: number;
}

/** JSON from `POST /api/v1/admin/database/cleanup`. */
export interface AdminDatabaseCleanupResult {
  readonly ranAt: string;
  readonly results: readonly DatabaseCleanupCategoryResult[];
  readonly totalDeleted: number;
}
