import {
  DATABASE_CLEANUP_CATEGORY_IDS,
  type AdminDatabaseCleanupResult,
  type DatabaseCleanupCategoryId,
  type DatabaseCleanupCategoryResult,
} from '../../../shared/types/adminDatabaseMaintenance.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { logger } from '../../utils/logger.js';
import { CATEGORY_BY_ID, CATEGORY_DEFINITIONS } from './categories.js';

export async function runDatabaseCleanup(
  categoryIds: readonly DatabaseCleanupCategoryId[],
  adminUserId: string,
): Promise<AdminDatabaseCleanupResult> {
  const uniqueIds = [...new Set(categoryIds)];
  for (const id of uniqueIds) {
    if (!DATABASE_CLEANUP_CATEGORY_IDS.includes(id)) {
      throw new Error(`Invalid cleanup category: ${id}`);
    }
  }

  const results: DatabaseCleanupCategoryResult[] = [];

  for (const id of uniqueIds) {
    const def = CATEGORY_BY_ID.get(id);
    if (def == null) {
      continue;
    }
    const deletedCount = await def.cleanup();
    results.push({ id, deletedCount });
    logger.info({ category: id, deletedCount, adminUserId }, 'Admin database cleanup category completed');
  }

  const totalDeleted = results.reduce((sum, row) => sum + row.deletedCount, 0);

  logAuditEvent({
    userId: adminUserId,
    action: 'admin.database.cleanup',
    resourceType: 'system',
    resourceId: 'database',
    metadata: { categories: uniqueIds, results, totalDeleted },
    timestamp: new Date(),
  });

  return {
    ranAt: new Date().toISOString(),
    results,
    totalDeleted,
  };
}

export function listSafeCleanupCategoryIds(): readonly DatabaseCleanupCategoryId[] {
  return CATEGORY_DEFINITIONS.filter((def) => def.safeToDelete).map((def) => def.id);
}
