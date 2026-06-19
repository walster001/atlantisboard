import { resolveBackupScheduleIntervalMs } from '../../../shared/constants/backupScheduleInterval.js';
import { getAdminConfig } from '../adminService.js';
import { getResolvedBackupLocationFromEnv } from '../backupLocationEnv.js';
import {
  deleteBackupFolderCatalog,
  ensureBackupPathInCatalog,
  listBackupsCatalog,
} from './backupCatalog.js';
import { executeFullBackupWithProgressImpl } from './backupExecutor.js';
import { cancelBackupJobImpl, startBackupJobImpl, startRestoreJobImpl } from './jobService.js';
import { restoreFullBackupImpl } from './restoreExecutor.js';
import type {
  BackupListEntry,
  BackupProgressReporter,
} from './backupShared.js';

export type { BackupListEntry, BackupProgressReporter };

export { listBackupsCatalog as listBackups };
export { deleteBackupFolderCatalog as deleteBackupFolder };
export { executeFullBackupWithProgressImpl as executeFullBackupWithProgress };
export { startBackupJobImpl as startBackupJob };
export { cancelBackupJobImpl as cancelBackupJob };
export { ensureBackupPathInCatalog as ensureBackupPath };
export { restoreFullBackupImpl as restoreFullBackup };
export { startRestoreJobImpl as startRestoreJob };

export { resolveBackupDownloadTarget } from './backupDownload.js';
export { importBackupArchive, cleanupImportedBackupTempFile } from './importBackup.js';

export async function runScheduledBackupIfDue(): Promise<void> {
  const cfg = await getAdminConfig();
  const settings = cfg.backupSettings;
  const envLocation = getResolvedBackupLocationFromEnv();
  const dueAfterMs = settings != null ? resolveBackupScheduleIntervalMs(settings) : null;
  if (!settings?.scheduleEnabled || dueAfterMs == null || envLocation == null) {
    return;
  }
  const last = settings.lastScheduledRunAt?.getTime() ?? 0;
  if (Date.now() - last < dueAfterMs) {
    return;
  }
  const userId = String(cfg.updatedBy);
  const { reusedExisting } = await startBackupJobImpl({
    userId,
    filename: `scheduled-backup-${new Date().toISOString().slice(0, 10)}.zip`,
    backupSource: 'scheduled',
  });
  if (!reusedExisting) {
    if (cfg.backupSettings) {
      cfg.backupSettings.lastScheduledRunAt = new Date();
      cfg.markModified('backupSettings');
      await cfg.save();
    }
  }
}
