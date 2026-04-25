import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import type { AuthenticatedRequest } from '../../shared/types/express.js';
import { BackupJob } from '../models/BackupJob.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import {
  deleteBackupFolder,
  listBackups,
  restoreFullBackup,
  startBackupJob,
} from '../services/backupService.js';

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

router.post('/run', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { jobId, reusedExisting } = await startBackupJob({
      userId: authReq.user.id,
      ipAddress: req.ip || undefined,
    });
    res.status(202).json({
      message: reusedExisting ? 'Backup already in progress for your account.' : 'Backup started',
      jobId,
      reusedExisting,
    });
  } catch (error) {
    next(error);
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

router.delete('/:folderId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const folderId = backupFolderIdSchema.parse(req.params.folderId);
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
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          errors: error.issues,
        },
      });
      return;
    }
    next(error);
  }
});

const restoreBodySchema = z.object({
  confirmFolder: z.string().min(8).max(240),
});

router.post('/:folderId/restore', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const folderId = backupFolderIdSchema.parse(req.params.folderId);
    const body = restoreBodySchema.parse(req.body);
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
    await restoreFullBackup({
      folderId,
      adminUserId: authReq.user.id,
      ipAddress: req.ip || undefined,
    });
    res.json({ message: 'Backup restored. Consider restarting the server processes.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          errors: error.issues,
        },
      });
      return;
    }
    next(error);
  }
});

export { router as adminBackupRoutes };
