import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { notifications } from '@mantine/notifications';
import type { AdminBackupListItem } from '../../../../shared/types/adminBackup.js';
import { BACKUP_LOCATION_SETUP_GUIDANCE } from '../../../../shared/constants/backupLocationEnv.js';
import { api } from '../../../utils/api.js';
import { readApiErrorMessage } from '../AdminBackupPanel/helpers.js';
import { useRestoreJobPolling } from './useRestoreJobPolling.js';

export type RestoreStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface UseAdminBackupPanelStateResult {
  readonly backups: readonly AdminBackupListItem[];
  readonly loading: boolean;
  readonly running: boolean;
  readonly retention: number;
  readonly setRetention: Dispatch<SetStateAction<number>>;
  readonly savingRetention: boolean;
  readonly defaultLocation: string;
  readonly backupLocationConfigured: boolean;
  readonly scheduleDays: number;
  readonly setScheduleDays: Dispatch<SetStateAction<number>>;
  readonly scheduleEnabled: boolean;
  readonly createOpen: boolean;
  readonly setCreateOpen: Dispatch<SetStateAction<boolean>>;
  readonly createFilename: string;
  readonly setCreateFilename: Dispatch<SetStateAction<string>>;
  readonly creating: boolean;
  readonly scheduleOpen: boolean;
  readonly setScheduleOpen: Dispatch<SetStateAction<boolean>>;
  readonly savingSchedule: boolean;
  readonly restoreOpen: boolean;
  readonly setRestoreOpen: Dispatch<SetStateAction<boolean>>;
  readonly restoreTarget: AdminBackupListItem | null;
  readonly setRestoreTarget: Dispatch<SetStateAction<AdminBackupListItem | null>>;
  readonly restoreConfirm: string;
  readonly setRestoreConfirm: Dispatch<SetStateAction<string>>;
  readonly restoring: boolean;
  readonly restoreJobId: string | null;
  readonly restoreProgress: number;
  readonly restorePhase: string | undefined;
  readonly restoreFailure: string | null;
  readonly restoreStatus: RestoreStatus;
  readonly refreshBackupList: () => Promise<void>;
  readonly saveRetention: () => Promise<void>;
  readonly runBackup: () => Promise<void>;
  readonly saveSchedule: () => Promise<void>;
  readonly doRestore: () => Promise<void>;
}

export function useAdminBackupPanelState(): UseAdminBackupPanelStateResult {
  const [backups, setBackups] = useState<readonly AdminBackupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [retention, setRetention] = useState(14);
  const [savingRetention, setSavingRetention] = useState(false);
  const [defaultLocation, setDefaultLocation] = useState('');
  const [backupLocationConfigured, setBackupLocationConfigured] = useState(false);
  const [scheduleDays, setScheduleDays] = useState(14);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createFilename, setCreateFilename] = useState(
    `backup-${new Date().toISOString().slice(0, 10)}.zip`,
  );
  const [creating, setCreating] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<AdminBackupListItem | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreJobId, setRestoreJobId] = useState<string | null>(null);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restorePhase, setRestorePhase] = useState<string | undefined>(undefined);
  const [restoreFailure, setRestoreFailure] = useState<string | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>('idle');

  const refreshBackupList = useCallback(async (): Promise<void> => {
    try {
      const listRes = await api.listAdminBackups();
      setBackups(listRes.backups);
    } catch (error: unknown) {
      notifications.show({
        title: 'Could not refresh backups',
        message: error instanceof Error ? error.message : 'Unknown error',
        color: 'red',
      });
    }
  }, []);

  const loadFull = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [listRes, cfgRes] = await Promise.all([api.listAdminBackups(), api.getAdminConfig()]);
      setBackups(listRes.backups);
      const cfg = cfgRes.config as {
        backupSettings?: {
          retentionDays?: number;
          scheduleFrequencyDays?: number;
          scheduleEnabled?: boolean;
          environmentBackupLocation?: string | null;
          environmentBackupLocationConfigured?: boolean;
        };
      };
      const retentionDays = cfg.backupSettings?.retentionDays;
      if (typeof retentionDays === 'number' && Number.isFinite(retentionDays)) {
        setRetention(Math.min(3650, Math.max(1, Math.floor(retentionDays))));
      }
      setBackupLocationConfigured(cfg.backupSettings?.environmentBackupLocationConfigured === true);
      setDefaultLocation(
        typeof cfg.backupSettings?.environmentBackupLocation === 'string'
          ? cfg.backupSettings.environmentBackupLocation
          : '',
      );
      if (typeof cfg.backupSettings?.scheduleFrequencyDays === 'number') {
        setScheduleDays(Math.min(3650, Math.max(1, Math.floor(cfg.backupSettings.scheduleFrequencyDays))));
      } else {
        setScheduleDays(14);
      }
      setScheduleEnabled(cfg.backupSettings?.scheduleEnabled === true);
    } catch (error: unknown) {
      notifications.show({
        title: 'Could not load backups',
        message: error instanceof Error ? error.message : 'Unknown error',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFull();
  }, [loadFull]);

  const hasRunningJobs = useMemo(
    () => backups.some((backup) => backup.status === 'processing' || backup.status === 'pending'),
    [backups],
  );

  useEffect(() => {
    if (!hasRunningJobs) {
      return;
    }
    const id = window.setInterval(() => {
      void refreshBackupList();
    }, 2000);
    return () => {
      window.clearInterval(id);
    };
  }, [hasRunningJobs, refreshBackupList]);

  useRestoreJobPolling({
    restoreJobId,
    setRestoreStatus,
    setRestoreProgress,
    setRestorePhase,
    setRestoring,
    setRestoreJobId,
    setRestoreFailure,
    refreshBackupList,
  });

  const saveRetention = async (): Promise<void> => {
    setSavingRetention(true);
    try {
      await api.updateAdminConfig({ backupSettings: { retentionDays: retention } });
      notifications.show({ title: 'Retention saved', message: `${retention} days` });
    } catch (error: unknown) {
      notifications.show({
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        color: 'red',
      });
    } finally {
      setSavingRetention(false);
    }
  };

  const runBackup = async (): Promise<void> => {
    if (running || creating) {
      return;
    }
    const filename = createFilename.trim();
    if (filename === '') {
      notifications.show({ title: 'Missing filename', message: 'Enter a backup file name.', color: 'red' });
      return;
    }
    if (!backupLocationConfigured) {
      notifications.show({
        title: 'Backup location not configured',
        message: BACKUP_LOCATION_SETUP_GUIDANCE,
        color: 'red',
      });
      return;
    }
    setCreating(true);
    setRunning(true);
    try {
      await api.startAdminBackup({ filename });
      notifications.show({
        title: 'Backup started',
        message: 'Server backup job is running. Progress is shown in the table.',
      });
      setCreateOpen(false);
      await refreshBackupList();
    } catch (error: unknown) {
      notifications.show({
        title: 'Backup start failed',
        message: readApiErrorMessage(error, 'Backup failed to start.'),
        color: 'red',
      });
    } finally {
      setCreating(false);
      setRunning(false);
    }
  };

  const saveSchedule = async (): Promise<void> => {
    if (!backupLocationConfigured) {
      notifications.show({
        title: 'Backup location not configured',
        message: BACKUP_LOCATION_SETUP_GUIDANCE,
        color: 'red',
      });
      return;
    }
    setSavingSchedule(true);
    try {
      await api.updateAdminConfig({
        backupSettings: {
          retentionDays: retention,
          scheduleEnabled: true,
          scheduleFrequencyDays: scheduleDays,
        },
      });
      setScheduleEnabled(true);
      notifications.show({ title: 'Scheduled backup enabled', message: `Every ${scheduleDays} day(s)` });
      setScheduleOpen(false);
      await refreshBackupList();
    } catch (error: unknown) {
      notifications.show({
        title: 'Save failed',
        message: readApiErrorMessage(error, 'Unknown error'),
        color: 'red',
      });
    } finally {
      setSavingSchedule(false);
    }
  };

  const doRestore = async (): Promise<void> => {
    if (restoreTarget == null) return;
    if (restoreConfirm !== restoreTarget.folderId) return;
    setRestoring(true);
    setRestoreFailure(null);
    setRestoreProgress(0);
    setRestorePhase('queued');
    setRestoreStatus('pending');
    try {
      const response = await api.restoreAdminBackup(restoreTarget.folderId, restoreConfirm);
      setRestoreJobId(response.jobId);
      notifications.show({ title: 'Restore started', message: 'Live progress is shown in this dialog.' });
    } catch (error: unknown) {
      notifications.show({
        title: 'Restore failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        color: 'red',
      });
    } finally {
      setRestoring(false);
    }
  };

  return {
    backups,
    loading,
    running,
    retention,
    setRetention,
    savingRetention,
    defaultLocation,
    backupLocationConfigured,
    scheduleDays,
    setScheduleDays,
    scheduleEnabled,
    createOpen,
    setCreateOpen,
    createFilename,
    setCreateFilename,
    creating,
    scheduleOpen,
    setScheduleOpen,
    savingSchedule,
    restoreOpen,
    setRestoreOpen,
    restoreTarget,
    setRestoreTarget,
    restoreConfirm,
    setRestoreConfirm,
    restoring,
    restoreJobId,
    restoreProgress,
    restorePhase,
    restoreFailure,
    restoreStatus,
    refreshBackupList,
    saveRetention,
    runBackup,
    saveSchedule,
    doRestore,
  };
}
