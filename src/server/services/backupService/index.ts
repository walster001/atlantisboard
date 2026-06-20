import {
  deleteBackupFolderCatalog,
  ensureBackupPathInCatalog,
  listBackupsCatalog,
} from './backupCatalog.js';
import { runScheduledBackupsIfDue, createBackupScheduleImpl, updateBackupScheduleImpl } from './backupSchedule.js';
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

export { createBackupScheduleImpl as createBackupSchedule };
export { updateBackupScheduleImpl as updateBackupSchedule };
export { runScheduledBackupsIfDue };
export { migrateLegacyGlobalScheduleIfNeeded } from './backupSchedule.js';

export async function runScheduledBackupIfDue(): Promise<void> {
  await runScheduledBackupsIfDue();
}
