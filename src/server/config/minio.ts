import http from 'node:http';
import https from 'node:https';
import { Client as MinIOClient } from 'minio';
import { MINIO_BUCKET_CARD_ATTACHMENTS, MINIO_BUCKET_NAMES } from '../../shared/constants/minioBuckets.js';
import { getMinioPublicOrigin } from './attachmentDelivery.js';
import { logger } from '../utils/logger.js';

let minioClient: MinIOClient | null = null;
let minioPublicPresignClient: MinIOClient | null = null;

/** MinIO multipart part size (SDK default 64 MiB). Larger parts mean fewer sequential PUTs for big objects. Clamped 16–256 MiB. */
function getMinioUploadPartSizeBytes(): number {
  const parsed = Number.parseInt(process.env.MINIO_UPLOAD_PART_SIZE_MB ?? '128', 10);
  const mb = Number.isFinite(parsed) ? parsed : 128;
  const clamped = Math.min(256, Math.max(16, mb));
  return clamped * 1024 * 1024;
}

export function getMinIOClient(): MinIOClient {
  if (minioClient) {
    return minioClient;
  }

  const accessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin';
  const secretKey = process.env.MINIO_SECRET_KEY || 'minioadmin';
  const endPoint = process.env.MINIO_ENDPOINT || 'localhost';
  const port = Number(process.env.MINIO_PORT) || 9000;
  const useSSL = process.env.MINIO_USE_SSL === 'true';
  const partSize = getMinioUploadPartSizeBytes();
  const transportAgent = useSSL
    ? new https.Agent({ keepAlive: true, maxSockets: 32 })
    : new http.Agent({ keepAlive: true, maxSockets: 32 });

  minioClient = new MinIOClient({
    endPoint,
    port,
    useSSL,
    accessKey,
    secretKey,
    partSize,
    transportAgent,
  });

  logger.info('MinIO client initialized');
  return minioClient;
}

function buildMinioClientOptions(endPoint: string, port: number, useSSL: boolean): {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  partSize: number;
  transportAgent: http.Agent | https.Agent;
} {
  const accessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin';
  const secretKey = process.env.MINIO_SECRET_KEY || 'minioadmin';
  const partSize = getMinioUploadPartSizeBytes();
  const transportAgent = useSSL
    ? new https.Agent({ keepAlive: true, maxSockets: 32 })
    : new http.Agent({ keepAlive: true, maxSockets: 32 });
  return {
    endPoint,
    port,
    useSSL,
    accessKey,
    secretKey,
    partSize,
    transportAgent,
  };
}

/**
 * MinIO client whose host appears in presigned URLs (browser-reachable).
 * Falls back to the internal client when MINIO_PUBLIC_* is unset.
 */
export function getMinIOPublicPresignClient(): MinIOClient {
  if (minioPublicPresignClient) {
    return minioPublicPresignClient;
  }

  const publicEndpoint = (process.env.MINIO_PUBLIC_ENDPOINT ?? '').trim();
  if (publicEndpoint === '') {
    return getMinIOClient();
  }

  const port = Number.parseInt(process.env.MINIO_PUBLIC_PORT ?? process.env.MINIO_PORT ?? '9000', 10);
  const useSSL = process.env.MINIO_PUBLIC_USE_SSL === 'true';
  minioPublicPresignClient = new MinIOClient(
    buildMinioClientOptions(publicEndpoint, Number.isFinite(port) ? port : 9000, useSSL),
  );
  logger.info({ endPoint: publicEndpoint, port, useSSL }, 'MinIO public presign client initialized');
  return minioPublicPresignClient;
}

/**
 * The MinIO JS SDK does not expose PutBucketCors — configure CORS on the card-attachments
 * bucket via `mc admin` / console so browsers can Range-GET presigned URLs from APP_URL.
 */
function logCardAttachmentsCorsReminder(): void {
  const appUrl = (process.env.APP_URL ?? process.env.CORS_ORIGIN ?? '').trim();
  if (appUrl === '') {
    return;
  }
  let allowedOrigin: string;
  try {
    allowedOrigin = new URL(appUrl).origin;
  } catch {
    logger.warn({ appUrl }, 'Set MinIO bucket CORS manually — invalid APP_URL for reminder');
    return;
  }
  logger.info(
    {
      bucket: MINIO_BUCKET_CARD_ATTACHMENTS,
      allowedOrigin,
      publicOrigin: getMinioPublicOrigin(),
      methods: ['GET', 'HEAD'],
      headers: ['Range', 'Content-Type', 'Authorization', 'If-Range'],
    },
    'Configure MinIO card-attachments bucket CORS for direct browser streaming (GET + Range)',
  );
}

export async function initializeMinIOBuckets(): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    logger.info('Skipping MinIO bucket initialization in test environment');
    return;
  }

  const client = getMinIOClient();

  for (const bucketName of MINIO_BUCKET_NAMES) {
    try {
      const exists = await client.bucketExists(bucketName);
      if (!exists) {
        await client.makeBucket(bucketName);
        logger.info({ bucket: bucketName }, 'Created MinIO bucket');
      }

      if (bucketName === MINIO_BUCKET_CARD_ATTACHMENTS) {
        logCardAttachmentsCorsReminder();
      }
    } catch (error) {
      logger.error({ error, bucket: bucketName }, 'Error initializing MinIO bucket');
      throw error;
    }
  }

  logger.info('MinIO buckets initialized');
}

export { minioClient };

