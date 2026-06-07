import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import type { AdminBackupListItem } from '../../../../shared/types/adminBackup.js';
import {
  formatBackupRetentionLabel,
  normalizeBackupRetentionDays,
  type BackupRetentionDays,
} from '../../../../shared/constants/backupRetention.js';
import {
  formatBackupScheduleLabel,
  resolveBackupScheduleInterval,
  type BackupScheduleUnit,
} from '../../../../shared/constants/backupScheduleInterval.js';
import type { AdminBackupLocationCheckResult } from '../../../../shared/types/adminBackupLocation.js';
import { BACKUP_LOCATION_SETUP_GUIDANCE } from '../../../../shared/constants/backupLocationEnv.js';
import {
  buildDefaultBackupFilename,
  formatBackupFolderDisplayLabel,
} from '../../../../shared/utils/backupFolderNaming.js';
import { api } from '../../../utils/api.js';
import { readApiErrorMessage } from '../AdminBackupPanel/helpers.js';
import { useRestoreJobPolling } from './useRestoreJobPolling.js';

export type RestoreStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface UseAdminBackupPanelStateResult {
  readonly backups: readonly AdminBackupListItem[];
  readonly loading: boolean;
  readonly running: boolean;
  readonly retention: BackupRetentionDays;
  readonly setRetention: Dispatch<SetStateAction<BackupRetentionDays>>;
  readonly savingRetention: boolean;
  readonly defaultLocation: string;
  readonly backupLocationConfigured: boolean;
  readonly scheduleAmount: number;
  readonly setScheduleAmount: Dispatch<SetStateAction<number>>;
  readonly scheduleUnit: BackupScheduleUnit;
  readonly setScheduleUnit: Dispatch<SetStateAction<BackupScheduleUnit>>;
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
  readonly locationInput: string;
  readonly setLocationInput: Dispatch<SetStateAction<string>>;
  readonly locationCheck: AdminBackupLocationCheckResult | null;
  readonly checkingLocation: boolean;
  readonly savingLocation: boolean;
  readonly checkBackupLocation: () => Promise<void>;
  readonly saveBackupLocation: () => Promise<void>;
  readonly downloadBackup: (folderId: string) => Promise<void>;
  readonly downloadingBackupId: string | null;
}

export function useAdminBackupPanelState(): UseAdminBackupPanelStateResult {
  const [backups, setBackups] = useState<readonly AdminBackupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [retention, setRetention] = useState<BackupRetentionDays>(30);
  const [savingRetention, setSavingRetention] = useState(false);
  const [defaultLocation, setDefaultLocation] = useState('');
  const [backupLocationConfigured, setBackupLocationConfigured] = useState(false);
  const [scheduleAmount, setScheduleAmount] = useState(14);
  const [scheduleUnit, setScheduleUnit] = useState<BackupScheduleUnit>('days');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createFilename, setCreateFilename] = useState(() => buildDefaultBackupFilename());
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
  const [locationInput, setLocationInput] = useState('');
  const [locationCheck, setLocationCheck] = useState<AdminBackupLocationCheckResult | null>(null);
  const [checkingLocation, setCheckingLocation] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [downloadingBackupId, setDownloadingBackupId] = useState<string | null>(null);

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
          scheduleIntervalAmount?: number;
          scheduleIntervalUnit?: string;
          scheduleEnabled?: boolean;
          environmentBackupLocation?: string | null;
          environmentBackupLocationConfigured?: boolean;
        };
      };
      const retentionDays = cfg.backupSettings?.retentionDays;
      if (typeof retentionDays === 'number' && Number.isFinite(retentionDays)) {
        setRetention(normalizeBackupRetentionDays(retentionDays));
      }
      setBackupLocationConfigured(cfg.backupSettings?.environmentBackupLocationConfigured === true);
      const envLocation =
        typeof cfg.backupSettings?.environmentBackupLocation === 'string'
          ? cfg.backupSettings.environmentBackupLocation
          : '';
      setDefaultLocation(envLocation);
      setLocationInput((prev) => (prev.trim() === '' ? envLocation : prev));
      const schedule = resolveBackupScheduleInterval(cfg.backupSettings ?? {});
      setScheduleAmount(schedule.amount);
      setScheduleUnit(schedule.unit);
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
      notifications.show({
        title: 'Retention saved',
        message: formatBackupRetentionLabel(retention),
      });
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
          scheduleIntervalAmount: scheduleAmount,
          scheduleIntervalUnit: scheduleUnit,
        },
      });
      setScheduleEnabled(true);
      notifications.show({
        title: 'Scheduled backup enabled',
        message: `Every ${formatBackupScheduleLabel(scheduleAmount, scheduleUnit)}`,
      });
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

  const applyLocationStatus = useCallback(
    (status: {
      configured: boolean;
      path: string | null;
      exists: boolean;
      isDirectory: boolean;
      writable: boolean;
    }): void => {
      setBackupLocationConfigured(status.configured && status.path != null);
      if (status.path != null) {
        setDefaultLocation(status.path);
        setLocationInput(status.path);
        setLocationCheck({
          path: status.path,
          exists: status.exists,
          isDirectory: status.isDirectory,
          writable: status.writable,
        });
      }
    },
    [],
  );

  const persistBackupLocation = async (path: string, createIfMissing: boolean): Promise<void> => {
    setSavingLocation(true);
    try {
      const { status } = await api.setAdminBackupLocation({ path, createIfMissing });
      applyLocationStatus(status);
      notifications.show({
        title: 'Backup path saved',
        message: status.persistedToEnvFile
          ? `${status.path} (written to .env)`
          : `${status.path} (active until server restart — could not update .env)`,
        color: status.persistedToEnvFile ? 'green' : 'yellow',
      });
    } catch (error: unknown) {
      notifications.show({
        title: 'Could not save backup path',
        message: readApiErrorMessage(error, 'Save failed'),
        color: 'red',
      });
    } finally {
      setSavingLocation(false);
    }
  };

  const checkBackupLocation = async (): Promise<void> => {
    const path = locationInput.trim();
    if (path === '') {
      notifications.show({ title: 'Missing path', message: 'Enter an absolute backup directory path.', color: 'red' });
      return;
    }
    setCheckingLocation(true);
    try {
      const { result } = await api.checkAdminBackupLocation(path);
      setLocationCheck(result);
      notifications.show({
        title: 'Path checked',
        message: result.exists
          ? result.writable
            ? 'Directory exists and is writable.'
            : 'Directory exists but is not writable.'
          : 'Directory does not exist on the server.',
        color: result.exists && result.writable ? 'green' : 'yellow',
      });
    } catch (error: unknown) {
      notifications.show({
        title: 'Path check failed',
        message: readApiErrorMessage(error, 'Could not validate path'),
        color: 'red',
      });
    } finally {
      setCheckingLocation(false);
    }
  };

  const saveBackupLocation = async (): Promise<void> => {
    const path = locationInput.trim();
    if (path === '') {
      notifications.show({ title: 'Missing path', message: 'Enter an absolute backup directory path.', color: 'red' });
      return;
    }

    let shouldCreate = false;
    try {
      const { result } = await api.checkAdminBackupLocation(path);
      setLocationCheck(result);
      if (!result.exists) {
        shouldCreate = await new Promise<boolean>((resolve) => {
          modals.openConfirmModal({
            title: 'Create backup directory?',
            children: `The path ${path} does not exist on the server. Create it now?`,
            labels: { confirm: 'Create and save', cancel: 'Cancel' },
            confirmProps: { color: 'blue' },
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
        if (!shouldCreate) {
          return;
        }
      } else if (!result.isDirectory) {
        notifications.show({
          title: 'Invalid path',
          message: 'Backup path must be a directory.',
          color: 'red',
        });
        return;
      } else if (!result.writable) {
        notifications.show({
          title: 'Path not writable',
          message: 'Choose a directory the server process can write to.',
          color: 'red',
        });
        return;
      }
    } catch (error: unknown) {
      notifications.show({
        title: 'Path check failed',
        message: readApiErrorMessage(error, 'Could not validate path'),
        color: 'red',
      });
      return;
    }

    await persistBackupLocation(path, shouldCreate);
  };

  const downloadBackup = async (folderId: string): Promise<void> => {
    setDownloadingBackupId(folderId);
    try {
      await api.downloadAdminBackup(folderId);
      notifications.show({
        title: 'Download started',
        message: formatBackupFolderDisplayLabel(folderId),
        color: 'green',
      });
    } catch (error: unknown) {
      notifications.show({
        title: 'Download failed',
        message: readApiErrorMessage(error, 'Could not download backup'),
        color: 'red',
      });
    } finally {
      setDownloadingBackupId(null);
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
    scheduleAmount,
    setScheduleAmount,
    scheduleUnit,
    setScheduleUnit,
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
    locationInput,
    setLocationInput,
    locationCheck,
    checkingLocation,
    savingLocation,
    checkBackupLocation,
    saveBackupLocation,
    downloadBackup,
    downloadingBackupId,
  };
}
