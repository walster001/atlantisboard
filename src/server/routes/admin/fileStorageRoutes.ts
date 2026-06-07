import type { Router, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { MINIO_BUCKET_NAMES } from '../../../shared/constants/minioBuckets.js';
import { ADMIN_DESTRUCTIVE_CONFIRM_PHRASE } from '../../../shared/adminDestructiveConfirmation.js';
import { fileUploadRateLimiter } from '../../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../types/express.js';
import {
  createAdminFileStorageFolder,
  deleteAdminFileStorageObjects,
  getAdminFileStorageObjectStream,
  listAdminFileStorageBuckets,
  listAdminFileStorageObjects,
  uploadAdminFileStorageObject,
} from '../../services/adminFileStorageService/index.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';
import { parseOrThrow } from '../../utils/zodValidation.js';

const ADMIN_FILE_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

const fileStorageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ADMIN_FILE_UPLOAD_MAX_BYTES },
});

const bucketQuerySchema = z.object({
  bucket: z.enum(MINIO_BUCKET_NAMES),
  prefix: z.string().max(900).optional(),
});

const createFolderBodySchema = z.object({
  bucket: z.enum(MINIO_BUCKET_NAMES),
  prefix: z.string().max(900).optional(),
  folderName: z.string().trim().min(1).max(128),
});

const uploadBodySchema = z.object({
  bucket: z.enum(MINIO_BUCKET_NAMES),
  prefix: z.string().max(900).optional(),
});

const deleteBodySchema = z.object({
  bucket: z.enum(MINIO_BUCKET_NAMES),
  keys: z.array(z.string().trim().min(1).max(1024)).min(1).max(200),
  confirmPhrase: z.literal(ADMIN_DESTRUCTIVE_CONFIRM_PHRASE),
});

const downloadQuerySchema = z.object({
  bucket: z.enum(MINIO_BUCKET_NAMES),
  key: z.string().trim().min(1).max(1024),
});

function pipeObjectStream(
  res: Response,
  stream: NodeJS.ReadableStream,
  fileName: string,
  contentType: string | undefined,
  size: number | undefined,
): void {
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
  if (contentType != null && contentType.trim() !== '') {
    res.setHeader('Content-Type', contentType);
  }
  if (size != null && Number.isFinite(size)) {
    res.setHeader('Content-Length', String(size));
  }
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).end();
      return;
    }
    res.destroy();
  });
  stream.pipe(res);
}

export function registerFileStorageRoutes(router: Router): void {
  router.get('/file-storage/buckets', async (_req, res, next) => {
    try {
      const buckets = await listAdminFileStorageBuckets();
      res.json({ buckets });
    } catch (error) {
      next(error);
    }
  });

  router.get('/file-storage/objects', async (req, res, next) => {
    try {
      const parsed = bucketQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
        return;
      }
      const result = await listAdminFileStorageObjects(parsed.data.bucket, parsed.data.prefix);
      res.json(result);
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });

  router.post('/file-storage/folders', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const body = parseOrThrow(createFolderBodySchema, req.body);
      const result = await createAdminFileStorageFolder({
        bucketName: body.bucket,
        prefix: body.prefix,
        folderName: body.folderName,
        adminUserId: authReq.user.id,
      });
      res.status(201).json(result);
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });

  router.post(
    '/file-storage/upload',
    fileUploadRateLimiter,
    fileStorageUpload.single('file'),
    async (req, res, next) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const body = parseOrThrow(uploadBodySchema, req.body);
        if (!req.file) {
          res.status(400).json({
            error: {
              message: 'File is required',
              code: 'VALIDATION_ERROR',
              statusCode: 400,
            },
          });
          return;
        }
        const result = await uploadAdminFileStorageObject({
          bucketName: body.bucket,
          prefix: body.prefix,
          fileName: req.file.originalname,
          buffer: req.file.buffer,
          contentType: req.file.mimetype,
          adminUserId: authReq.user.id,
        });
        res.status(201).json(result);
      } catch (error) {
        handleApiRouteError(res, error, next);
      }
    },
  );

  router.get('/file-storage/download', async (req, res, next) => {
    try {
      const parsed = downloadQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
        return;
      }
      const { stream, contentType, size, fileName } = await getAdminFileStorageObjectStream({
        bucketName: parsed.data.bucket,
        key: parsed.data.key,
      });
      pipeObjectStream(res, stream, fileName, contentType, size);
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });

  router.delete('/file-storage/objects', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const body = parseOrThrow(deleteBodySchema, req.body);
      const result = await deleteAdminFileStorageObjects({
        bucketName: body.bucket,
        keys: body.keys,
        adminUserId: authReq.user.id,
      });
      res.json(result);
    } catch (error) {
      handleApiRouteError(res, error, next);
    }
  });
}
