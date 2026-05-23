import { useCallback, useEffect, useState } from 'react';
import { notifications } from '@mantine/notifications';
import type {
  AdminDatabaseMaintenanceSnapshot,
  DatabaseCleanupCategoryId,
} from '../../../../shared/types/adminDatabaseMaintenance.js';
import { api } from '../../../utils/api.js';

export function useAdminDatabasePanelState() {
  const [snapshot, setSnapshot] = useState<AdminDatabaseMaintenanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cleaningCategoryId, setCleaningCategoryId] = useState<DatabaseCleanupCategoryId | null>(
    null,
  );
  const [cleaningAllSafe, setCleaningAllSafe] = useState(false);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const next = await api.getAdminDatabaseStats();
      setSnapshot(next);
    } catch (e: unknown) {
      notifications.show({
        title: 'Database stats unavailable',
        message: e instanceof Error ? e.message : 'Unknown error',
        color: 'red',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runCleanup = useCallback(
    async (categories: readonly DatabaseCleanupCategoryId[]) => {
      try {
        const result = await api.runAdminDatabaseCleanup(categories);
        notifications.show({
          title: 'Cleanup complete',
          message: `Removed ${result.totalDeleted} document${result.totalDeleted === 1 ? '' : 's'}.`,
          color: 'green',
        });
        await refresh({ silent: true });
        return result;
      } catch (e: unknown) {
        notifications.show({
          title: 'Cleanup failed',
          message: e instanceof Error ? e.message : 'Unknown error',
          color: 'red',
        });
        throw e;
      }
    },
    [refresh],
  );

  const cleanupCategory = useCallback(
    async (categoryId: DatabaseCleanupCategoryId) => {
      setCleaningCategoryId(categoryId);
      try {
        await runCleanup([categoryId]);
      } finally {
        setCleaningCategoryId(null);
      }
    },
    [runCleanup],
  );

  const cleanupAllSafe = useCallback(async () => {
    setCleaningAllSafe(true);
    try {
      const { categories } = await api.getAdminSafeDatabaseCleanupCategories();
      const withRows =
        snapshot?.cleanupCategories
          .filter((row) => row.safeToDelete && row.count > 0 && categories.includes(row.id))
          .map((row) => row.id) ?? [];
      if (withRows.length === 0) {
        notifications.show({
          title: 'Nothing to clean',
          message: 'No safe cleanup categories currently have removable rows.',
          color: 'blue',
        });
        return;
      }
      await runCleanup(withRows);
    } finally {
      setCleaningAllSafe(false);
    }
  }, [runCleanup, snapshot?.cleanupCategories]);

  return {
    snapshot,
    loading,
    refreshing,
    cleaningCategoryId,
    cleaningAllSafe,
    refresh,
    cleanupCategory,
    cleanupAllSafe,
  };
}
