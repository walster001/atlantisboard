import http from 'node:http';
import https from 'node:https';
import { Client as MinIOClient } from 'minio';
import {
  MINIO_BUCKET_BRANDING,
  MINIO_BUCKET_NAMES,
} from '../../shared/constants/minioBuckets.js';
import { logger } from '../utils/logger.js';

let minioClient: MinIOClient | null = null;

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

export async function initializeMinIOBuckets(): Promise<void> {
  const client = getMinIOClient();

  for (const bucketName of MINIO_BUCKET_NAMES) {
    try {
      const exists = await client.bucketExists(bucketName);
      if (!exists) {
        await client.makeBucket(bucketName);
        logger.info({ bucket: bucketName }, 'Created MinIO bucket');
      }

      // Public read for direct MinIO URLs (optional; API also proxies GET /branding/*).
      // Do not fail startup if the bucket uses a custom policy in the console.
      if (bucketName === MINIO_BUCKET_BRANDING) {
        try {
          await client.setBucketPolicy(
            bucketName,
            JSON.stringify({
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: { AWS: ['*'] },
                  Action: ['s3:GetObject'],
                  Resource: [`arn:aws:s3:::${bucketName}/*`],
                },
              ],
            })
          );
          logger.info({ bucket: bucketName }, 'Set branding bucket to public read');
        } catch (error) {
          logger.warn(
            { error, bucket: bucketName },
            'Could not apply default branding bucket policy; ensure MinIO allows GetObject if needed, or keep your custom policy'
          );
        }
      }
    } catch (error) {
      logger.error({ error, bucket: bucketName }, 'Error initializing MinIO bucket');
      throw error;
    }
  }

  logger.info('MinIO buckets initialized');
}

export { minioClient };

