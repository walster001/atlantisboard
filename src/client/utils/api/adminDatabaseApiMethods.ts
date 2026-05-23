import type {
  AdminDatabaseCleanupResult,
  AdminDatabaseMaintenanceSnapshot,
  DatabaseCleanupCategoryId,
} from '../../../shared/types/adminDatabaseMaintenance.js';
import type { ApiClient } from '../api.js';

export interface AdminDatabaseApiMethods {
  getAdminDatabaseStats(): Promise<AdminDatabaseMaintenanceSnapshot>;
  runAdminDatabaseCleanup(
    categories: readonly DatabaseCleanupCategoryId[],
  ): Promise<AdminDatabaseCleanupResult>;
  getAdminSafeDatabaseCleanupCategories(): Promise<{ categories: readonly DatabaseCleanupCategoryId[] }>;
}

export const adminDatabaseApiMethods: AdminDatabaseApiMethods = {
  async getAdminDatabaseStats(this: ApiClient) {
    const response = await this.client.get('/admin/database/stats');
    return response.data as AdminDatabaseMaintenanceSnapshot;
  },

  async runAdminDatabaseCleanup(this: ApiClient, categories) {
    const response = await this.client.post('/admin/database/cleanup', { categories });
    return response.data as AdminDatabaseCleanupResult;
  },

  async getAdminSafeDatabaseCleanupCategories(this: ApiClient) {
    const response = await this.client.get('/admin/database/safe-cleanup-categories');
    return response.data as { categories: readonly DatabaseCleanupCategoryId[] };
  },
};
