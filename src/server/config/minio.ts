import http from 'node:http';
import https from 'node:https';
import { Client as MinIOClient } from 'minio';
import { MINIO_BUCKET_CARD_ATTACHMENTS, MINIO_BUCKET_NAMES } from '../../shared/constants/minioBuckets.js';
import {
  getMinioPublicOrigin,
  isMinioPublicPresignConfigured,
  resolveMinioPublicEndpointConfig,
} from './attachmentDelivery.js';
import { logger } from '../utils/logger.js';

let minioClient: MinIOClient | null = null;
let minioPublicPresignClient: MinIOClient | null = null;

/** Socket/request timeout for MinIO API calls (ms). Prevents hung deletes when endpoint is unreachable. */
function getMinioRequestTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.MINIO_REQUEST_TIMEOUT_MS ?? '30000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
}

function createMinioTransportAgent(useSSL: boolean): http.Agent | https.Agent {
  const timeout = getMinioRequestTimeoutMs();
  return useSSL
    ? new https.Agent({ keepAlive: true, maxSockets: 32, timeout })
    : new http.Agent({ keepAlive: true, maxSockets: 32, timeout });
}

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
  const transportAgent = createMinioTransportAgent(useSSL);

  minioClient = new MinIOClient({
    endPoint,
    port,
    useSSL,
    accessKey,
    secretKey,
    partSize,
    transportAgent,
  });

  logger.info(
    {
      endPoint,
      port,
      useSSL,
      requestTimeoutMs: getMinioRequestTimeoutMs(),
      event: 'minio.client.initialized',
    },
    'MinIO internal client initialized (use Docker service hostname, not public CDN host)',
  );
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
  const transportAgent = createMinioTransportAgent(useSSL);
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
 * Requires `MINIO_PUBLIC_*` or `S3_PUBLIC_URL` / `ATTACHMENT_PUBLIC_BASE` — never uses internal endpoint.
 */
export function getMinIOPublicPresignClient(): MinIOClient {
  if (minioPublicPresignClient) {
    return minioPublicPresignClient;
  }

  if (!isMinioPublicPresignConfigured()) {
    throw new Error(
      'MinIO public presign endpoint is not configured. Set MINIO_PUBLIC_ENDPOINT (or S3_PUBLIC_URL) for direct browser delivery, or use ATTACHMENT_DELIVERY_MODE=proxy.',
    );
  }

  const publicConfig = resolveMinioPublicEndpointConfig();
  if (publicConfig == null) {
    throw new Error('MinIO public presign endpoint configuration is invalid');
  }

  const { endPoint, port, useSSL } = publicConfig;
  minioPublicPresignClient = new MinIOClient(buildMinioClientOptions(endPoint, port, useSSL));
  logger.info({ endPoint, port, useSSL }, 'MinIO public presign client initialized');
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

