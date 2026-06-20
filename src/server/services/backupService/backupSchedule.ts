import mongoose from 'mongoose';
import {
  backupScheduleToMs,
  clampBackupScheduleAmount,
  isBackupScheduleUnit,
  resolveBackupScheduleInterval,
  type BackupScheduleUnit,
} from '../../../shared/constants/backupScheduleInterval.js';
import {
  buildScheduleFolderId,
  formatBackupFolderTimestamp,
  isScheduledBackupFolderId,
} from '../../../shared/utils/backupFolderNaming.js';
import { BadRequestError, NotFoundError } from '../../../shared/errors/domainErrors.js';
import { BackupJob } from '../../models/BackupJob.js';
import { getAdminConfig } from '../adminService.js';
import { requireBackupLocationFromEnv } from '../backupLocationEnv.js';
import { normalizeFilename, normalizeLocationPath } from './backupShared.js';
import { startBackupJobImpl } from './jobService.js';

/** ponytail: schedule rows use far-future TTL so cron cleanup does not drop definitions. */
const SCHEDULE_EXPIRES_AT = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);

export function isBackupScheduleDue(params: {
  readonly lastRunAtMs: number | null;
  readonly createdAtMs: number;
  readonly intervalMs: number;
  readonly nowMs: number;
}): boolean {
  const anchor = params.lastRunAtMs ?? params.createdAtMs;
  return params.nowMs - anchor >= params.intervalMs;
}

export function scheduledRunFilename(scheduleFilename: string, date: Date = new Date()): string {
  const normalized = normalizeFilename(scheduleFilename);
  const stem = normalized.replace(/\.zip$/i, '');
  return `${stem}-${formatBackupFolderTimestamp(date)}.zip`;
}

export async function migrateLegacyGlobalScheduleIfNeeded(adminUserId: string): Promise<void> {
  const cfg = await getAdminConfig();
  const settings = cfg.backupSettings;
  if (settings?.scheduleEnabled !== true) {
    return;
  }
  try {
    requireBackupLocationFromEnv();
  } catch {
    return;
  }
  const existing = await BackupJob.findOne({ jobKind: 'schedule' }).lean();
  if (existing == null) {
    const interval = resolveBackupScheduleInterval(settings);
    await createBackupScheduleImpl({
      userId: adminUserId,
      filename: 'scheduled-backup.zip',
      intervalAmount: interval.amount,
      intervalUnit: interval.unit,
      lastScheduledRunAt: settings.lastScheduledRunAt,
    });
  }
  if (cfg.backupSettings) {
    cfg.backupSettings.scheduleEnabled = false;
    cfg.markModified('backupSettings');
    await cfg.save();
  }
}

export async function createBackupScheduleImpl(params: {
  readonly userId: string;
  readonly filename: string;
  readonly intervalAmount: number;
  readonly intervalUnit: BackupScheduleUnit;
  readonly lastScheduledRunAt?: Date | undefined;
}): Promise<{ folderId: string; jobId: string }> {
  const location = requireBackupLocationFromEnv();
  const userOid = new mongoose.Types.ObjectId(params.userId);
  const jobId = new mongoose.Types.ObjectId();
  const folderId = buildScheduleFolderId(String(jobId));
  const intervalAmount = clampBackupScheduleAmount(params.intervalAmount, params.intervalUnit);
  const doc = await BackupJob.create({
    _id: jobId,
    userId: userOid,
    jobKind: 'schedule',
    backupSource: 'scheduled',
    status: 'completed',
    progress: 100,
    totalItems: 1,
    processedItems: 1,
    currentPhase: 'schedule_active',
    filename: normalizeFilename(params.filename),
    location: normalizeLocationPath(location),
    result: {
      folderId,
      // ponytail: no archive on disk; non-empty sentinel satisfies Mongoose required filePath
      filePath: folderId,
      sizeBytes: 0,
      prunedCount: 0,
    },
    scheduleIntervalAmount: intervalAmount,
    scheduleIntervalUnit: params.intervalUnit,
    completedAt: new Date(),
    ...(params.lastScheduledRunAt != null ? { lastScheduledRunAt: params.lastScheduledRunAt } : {}),
    expiresAt: SCHEDULE_EXPIRES_AT,
  });
  return { folderId, jobId: String(doc._id) };
}

export async function updateBackupScheduleImpl(params: {
  readonly folderId: string;
  readonly filename?: string | undefined;
  readonly intervalAmount?: number | undefined;
  readonly intervalUnit?: BackupScheduleUnit | undefined;
}): Promise<void> {
  if (!isScheduledBackupFolderId(params.folderId)) {
    throw new BadRequestError('Not a scheduled backup definition');
  }
  const job = await BackupJob.findOne({
    jobKind: 'schedule',
    'result.folderId': params.folderId,
  });
  if (job == null) {
    throw new NotFoundError('Scheduled backup not found');
  }
  if (params.filename != null) {
    job.filename = normalizeFilename(params.filename);
  }
  if (params.intervalAmount != null && params.intervalUnit != null) {
    job.scheduleIntervalAmount = clampBackupScheduleAmount(params.intervalAmount, params.intervalUnit);
    job.scheduleIntervalUnit = params.intervalUnit;
  }
  await job.save();
}

export async function runScheduledBackupsIfDue(): Promise<void> {
  let adminUserId: string;
  try {
    requireBackupLocationFromEnv();
    const cfg = await getAdminConfig();
    adminUserId = String(cfg.updatedBy);
    await migrateLegacyGlobalScheduleIfNeeded(adminUserId);
  } catch {
    return;
  }

  const schedules = await BackupJob.find({ jobKind: 'schedule', status: 'completed' }).lean();
  const nowMs = Date.now();
  for (const schedule of schedules) {
    const folderId = schedule.result?.folderId;
    const amount = schedule.scheduleIntervalAmount;
    const unit = schedule.scheduleIntervalUnit;
    if (
      folderId == null ||
      typeof amount !== 'number' ||
      typeof unit !== 'string' ||
      !isBackupScheduleUnit(unit)
    ) {
      continue;
    }
    const intervalMs = backupScheduleToMs(amount, unit);
    const lastRunAtMs = schedule.lastScheduledRunAt?.getTime() ?? null;
    const createdAtMs = schedule.createdAt.getTime();
    if (!isBackupScheduleDue({ lastRunAtMs, createdAtMs, intervalMs, nowMs })) {
      continue;
    }
    const { reusedExisting } = await startBackupJobImpl({
      userId: String(schedule.userId),
      filename: scheduledRunFilename(schedule.filename),
      backupSource: 'scheduled',
      scheduleParentFolderId: folderId,
    });
    if (!reusedExisting) {
      await BackupJob.findByIdAndUpdate(schedule._id, { lastScheduledRunAt: new Date() });
    }
  }
}
