import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { notifications } from '@mantine/notifications';
import { api } from '../../../utils/api.js';
import { parseBackupJob } from '../../../utils/adminBackupJobPoll.js';
import { readApiErrorMessage } from './helpers.js';
import type { RestoreStatus } from './useAdminBackupPanelState.js';

interface UseRestoreJobPollingArgs {
  readonly restoreJobId: string | null;
  readonly setRestoreStatus: Dispatch<SetStateAction<RestoreStatus>>;
  readonly setRestoreProgress: Dispatch<SetStateAction<number>>;
  readonly setRestorePhase: Dispatch<SetStateAction<string | undefined>>;
  readonly setRestoring: Dispatch<SetStateAction<boolean>>;
  readonly setRestoreJobId: Dispatch<SetStateAction<string | null>>;
  readonly setRestoreFailure: Dispatch<SetStateAction<string | null>>;
  readonly refreshBackupList: () => Promise<void>;
}

export function useRestoreJobPolling({
  restoreJobId,
  setRestoreStatus,
  setRestoreProgress,
  setRestorePhase,
  setRestoring,
  setRestoreJobId,
  setRestoreFailure,
  refreshBackupList,
}: UseRestoreJobPollingArgs): void {
  useEffect(() => {
    if (restoreJobId == null) {
      return;
    }
    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const response = await api.getAdminBackupJob(restoreJobId);
        const job = parseBackupJob(response.job);
        if (job == null || cancelled) {
          return;
        }
        setRestoreStatus(job.status as RestoreStatus);
        setRestoreProgress(Math.max(0, Math.min(100, Math.floor(job.progress))));
        setRestorePhase(job.currentPhase);
        if (job.status === 'completed') {
          setRestoring(false);
          setRestoreJobId(null);
          notifications.show({
            title: 'Restore complete',
            message: 'Backup restored. Restart server processes to refresh long-lived caches.',
          });
          await refreshBackupList();
          return;
        }
        if (job.status === 'failed' || job.status === 'cancelled') {
          setRestoring(false);
          setRestoreJobId(null);
          setRestoreFailure(
            job.failureMessage ?? (job.status === 'cancelled' ? 'Restore cancelled.' : 'Restore failed.'),
          );
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setRestoring(false);
          setRestoreFailure(readApiErrorMessage(error, 'Failed to poll restore progress.'));
        }
      }
    };
    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    refreshBackupList,
    restoreJobId,
    setRestoreFailure,
    setRestoreJobId,
    setRestorePhase,
    setRestoreProgress,
    setRestoreStatus,
    setRestoring,
  ]);
}
