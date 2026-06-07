import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { ADMIN_DESTRUCTIVE_CONFIRM_PHRASE } from '../../shared/adminDestructiveConfirmation.js';
import type { AuthenticatedRequest } from '../types/express.js';
import { BackupJob } from '../models/BackupJob.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import {
  cancelBackupJob,
  deleteBackupFolder,
  listBackups,
  resolveBackupDownloadTarget,
  startBackupJob,
  startRestoreJob,
} from '../services/backupService.js';
import {
  applyBackupLocation,
  BackupLocationNotConfiguredError,
  checkBackupLocationPath,
  getBackupLocationStatusAsync,
} from '../services/backupLocationEnv.js';
import { handleApiRouteError } from '../utils/mapServiceErrorToHttp.js';
import { parseOrThrow } from '../utils/zodValidation.js';

const router = Router();

const backupFolderIdSchema = z
  .string()
  .min(8)
  .max(240)
  .regex(/^[0-9]+_[0-9A-Za-z.-]+$/, 'Invalid backup folder id');

router.get('/list', async (_req, res, next) => {
  try {
    const backups = await listBackups();
    res.json({ backups });
  } catch (error) {
    next(error);
  }
});

const backupLocationPathSchema = z.object({
  path: z.string().trim().min(1).max(4096),
});

router.get('/location', async (_req, res, next) => {
  try {
    const status = await getBackupLocationStatusAsync();
    res.json({ status });
  } catch (error) {
    next(error);
  }
});

router.post('/location/check', async (req, res, next) => {
  try {
    const body = parseOrThrow(backupLocationPathSchema, req.body);
    const result = await checkBackupLocationPath(body.path);
    res.json({ result });
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
});

const setBackupLocationBodySchema = backupLocationPathSchema.extend({
  createIfMissing: z.boolean().optional().default(false),
});

router.put('/location', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = parseOrThrow(setBackupLocationBodySchema, req.body);
    const status = await applyBackupLocation({
      path: body.path,
      createIfMissing: body.createIfMissing,
    });
    logAuditEvent({
      userId: authReq.user.id,
      action: 'admin_backup_location_set',
      resourceType: 'backup',
      resourceId: status.path ?? 'unknown',
      ipAddress: req.ip || undefined,
      timestamp: new Date(),
    });
    res.json({ status });
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
});

function pipeBackupDownload(
  res: Response,
  filePath: string,
  fileName: string,
  sizeBytes: number,
): void {
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.setHeader('Content-Type', 'application/zip');
  if (Number.isFinite(sizeBytes) && sizeBytes > 0) {
    res.setHeader('Content-Length', String(sizeBytes));
  }
  const stream = createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).end();
      return;
    }
    res.destroy();
  });
  stream.pipe(res);
}

router.get('/:folderId/download', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const folderId = parseOrThrow(backupFolderIdSchema, req.params.folderId);
    const target = await resolveBackupDownloadTarget(folderId);
    logAuditEvent({
      userId: authReq.user.id,
      action: 'admin_backup_downloaded',
      resourceType: 'backup',
      resourceId: folderId,
      ipAddress: req.ip || undefined,
      timestamp: new Date(),
    });
    pipeBackupDownload(res, target.filePath, target.fileName, target.sizeBytes);
  } catch (error) {
    if (error instanceof BackupLocationNotConfiguredError) {
      res.status(error.statusCode).json({
        error: {
          message: error.message,
          code: error.code,
          statusCode: error.statusCode,
        },
      });
      return;
    }
    handleApiRouteError(res, error, next);
  }
});

router.post('/run', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const bodySchema = z.object({
      filename: z.string().trim().min(1).max(240),
    });
    const body = parseOrThrow(bodySchema, req.body);
    const { jobId, reusedExisting } = await startBackupJob({
      userId: authReq.user.id,
      ipAddress: req.ip || undefined,
      filename: body.filename,
    });
    res.status(202).json({
      message: reusedExisting ? 'Backup already in progress for your account.' : 'Backup started',
      jobId,
      reusedExisting,
    });
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
});

router.get('/jobs/:jobId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const rawId = req.params.jobId;
    if (!mongoose.isValidObjectId(rawId)) {
      res.status(400).json({
        error: {
          message: 'Invalid job id',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    const job = await BackupJob.findById(rawId).lean();
    if (!job) {
      res.status(404).json({
        error: {
          message: 'Backup job not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    if (String(job.userId) !== authReq.user.id) {
      res.status(403).json({
        error: {
          message: 'Access denied',
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      });
      return;
    }
    res.json({ job });
  } catch (error) {
    next(error);
  }
});

router.post('/jobs/:jobId/cancel', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const rawId = req.params.jobId;
    if (!mongoose.isValidObjectId(rawId)) {
      res.status(400).json({
        error: {
          message: 'Invalid job id',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    const cancelled = await cancelBackupJob(rawId, authReq.user.id);
    if (!cancelled) {
      res.status(409).json({
        error: {
          message: 'Backup job is not cancellable',
          code: 'CONFLICT',
          statusCode: 409,
        },
      });
      return;
    }
    res.json({ message: 'Cancel requested' });
  } catch (error) {
    next(error);
  }
});

const deleteBackupBodySchema = z.object({
  confirmPhrase: z.literal(ADMIN_DESTRUCTIVE_CONFIRM_PHRASE),
});

router.delete('/:folderId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const folderId = parseOrThrow(backupFolderIdSchema, req.params.folderId);
    parseOrThrow(deleteBackupBodySchema, req.body);
    await deleteBackupFolder(folderId);
    logAuditEvent({
      userId: authReq.user.id,
      action: 'admin_backup_deleted',
      resourceType: 'backup',
      resourceId: folderId,
      ipAddress: req.ip || undefined,
      timestamp: new Date(),
    });
    res.status(204).end();
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
});

const restoreBodySchema = z.object({
  confirmFolder: z.string().min(8).max(240),
});

router.post('/:folderId/restore', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const folderId = parseOrThrow(backupFolderIdSchema, req.params.folderId);
    const body = parseOrThrow(restoreBodySchema, req.body);
    if (body.confirmFolder !== folderId) {
      res.status(400).json({
        error: {
          message: 'confirmFolder must match the backup folder id',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    const { jobId, reusedExisting } = await startRestoreJob({
      folderId,
      userId: authReq.user.id,
      ipAddress: req.ip || undefined,
    });
    res.status(202).json({
      message: reusedExisting ? 'Restore already in progress for your account.' : 'Restore started',
      jobId,
      reusedExisting,
    });
  } catch (error) {
    handleApiRouteError(res, error, next);
  }
});

export { router as adminBackupRoutes };
