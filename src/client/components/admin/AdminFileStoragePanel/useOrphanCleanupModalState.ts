import { useCallback, useEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import type {
  AdminFileStorageOrphanEntry,
  AdminFileStorageOrphanScanResponse,
} from '../../../../shared/types/adminFileStorage.js';
import { api } from '../../../utils/api.js';

type OrphanScanPhase = 'idle' | 'references' | 'scanning' | 'complete' | 'error';

export function useOrphanCleanupModalState(opened: boolean) {
  const [phase, setPhase] = useState<OrphanScanPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [orphans, setOrphans] = useState<readonly AdminFileStorageOrphanEntry[]>([]);
  const [scanMeta, setScanMeta] = useState<AdminFileStorageOrphanScanResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [cleaningAll, setCleaningAll] = useState(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current != null) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const startProgressAnimation = useCallback(() => {
    clearProgressTimer();
    setProgress(8);
    progressTimerRef.current = setInterval(() => {
      setProgress((current) => {
        if (current >= 92) {
          return current;
        }
        return Math.min(92, current + 4);
      });
    }, 350);
  }, [clearProgressTimer]);

  const runScan = useCallback(async () => {
    clearProgressTimer();
    setPhase('references');
    setProgress(12);
    setErrorMessage(null);
    setOrphans([]);
    setScanMeta(null);
    startProgressAnimation();
    try {
      setPhase('scanning');
      const result = await api.scanAdminFileStorageOrphans();
      clearProgressTimer();
      setProgress(100);
      setPhase('complete');
      setOrphans(result.orphans);
      setScanMeta(result);
    } catch (e: unknown) {
      clearProgressTimer();
      setPhase('error');
      setProgress(0);
      setErrorMessage(e instanceof Error ? e.message : 'Scan failed');
    }
  }, [clearProgressTimer, startProgressAnimation]);

  useEffect(() => {
    if (!opened) {
      clearProgressTimer();
      setPhase('idle');
      setProgress(0);
      setOrphans([]);
      setScanMeta(null);
      setErrorMessage(null);
      setDeletingKey(null);
      setCleaningAll(false);
      return;
    }
    void runScan();
  }, [opened, runScan, clearProgressTimer]);

  useEffect(() => () => clearProgressTimer(), [clearProgressTimer]);

  const deleteOrphan = useCallback(
    async (entry: AdminFileStorageOrphanEntry) => {
      const token = `${entry.bucket}\0${entry.key}`;
      setDeletingKey(token);
      try {
        const result = await api.deleteAdminFileStorageOrphans([
          { bucket: entry.bucket, key: entry.key },
        ]);
        setOrphans((current) =>
          current.filter((item) => !(item.bucket === entry.bucket && item.key === entry.key)),
        );
        notifications.show({
          title: 'Orphan removed',
          message: `Deleted ${result.deletedCount} object${result.deletedCount === 1 ? '' : 's'}.`,
          color: 'green',
        });
      } catch (e: unknown) {
        notifications.show({
          title: 'Delete failed',
          message: e instanceof Error ? e.message : 'Unknown error',
          color: 'red',
        });
      } finally {
        setDeletingKey(null);
      }
    },
    [],
  );

  const deleteAllOrphans = useCallback(async () => {
    if (orphans.length === 0) {
      return;
    }
    setCleaningAll(true);
    try {
      const result = await api.deleteAdminFileStorageOrphans(
        orphans.map((entry) => ({ bucket: entry.bucket, key: entry.key })),
      );
      setOrphans([]);
      notifications.show({
        title: 'Cleanup complete',
        message: `Deleted ${result.deletedCount} orphaned object${result.deletedCount === 1 ? '' : 's'}.`,
        color: 'green',
      });
    } catch (e: unknown) {
      notifications.show({
        title: 'Cleanup failed',
        message: e instanceof Error ? e.message : 'Unknown error',
        color: 'red',
      });
    } finally {
      setCleaningAll(false);
    }
  }, [orphans]);

  return {
    phase,
    progress,
    orphans,
    scanMeta,
    errorMessage,
    deletingKey,
    cleaningAll,
    runScan,
    deleteOrphan,
    deleteAllOrphans,
  };
}

export type UseOrphanCleanupModalStateResult = ReturnType<typeof useOrphanCleanupModalState>;
