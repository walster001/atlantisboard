import { describe, expect, test, afterEach } from 'bun:test';
import { rewritePresignedUrlToPublicBase } from '../src/server/utils/rewritePresignedMinioUrl.js';
import {
  getMinioCdnPathPrefix,
  getMinioPublicOrigin,
  isMinioCdnEdgeTerminationEnabled,
  isMinioCdnProxyEnabled,
  isMinioPublicPresignConfigured,
  resolveAttachmentPublicBaseUrl,
} from '../src/server/config/attachmentDelivery.js';

describe('MinIO CDN presign', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('resolveAttachmentPublicBaseUrl from MINIO_CDN_PATH_PREFIX + APP_URL', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.S3_PUBLIC_URL;
    delete process.env.ATTACHMENT_PUBLIC_BASE;
    process.env.MINIO_CDN_PATH_PREFIX = '/cdn';
    process.env.APP_URL = 'http://localhost:3000';

    expect(resolveAttachmentPublicBaseUrl()).toBe('http://localhost:3000/cdn');
    expect(getMinioCdnPathPrefix()).toBe('/cdn');
    expect(isMinioCdnProxyEnabled()).toBe(true);
    expect(isMinioPublicPresignConfigured()).toBe(true);
    expect(getMinioPublicOrigin()).toBeNull();
  });

  test('resolveAttachmentPublicBaseUrl from S3_PUBLIC_URL with path', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.MINIO_CDN_PATH_PREFIX;
    process.env.S3_PUBLIC_URL = 'http://localhost:3000/cdn';

    expect(resolveAttachmentPublicBaseUrl()).toBe('http://localhost:3000/cdn');
    expect(isMinioCdnProxyEnabled()).toBe(true);
  });

  test('rewritePresignedUrlToPublicBase preserves query signature', () => {
    const rewritten = rewritePresignedUrlToPublicBase(
      'http://minio:9000/card-attachments/obj.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=x',
      'http://localhost:3000/cdn',
    );
    expect(rewritten).toBe(
      'http://localhost:3000/cdn/card-attachments/obj.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=x',
    );
  });

  test('isMinioCdnEdgeTerminationEnabled reads MINIO_CDN_EDGE_TERMINATION', () => {
    process.env.MINIO_CDN_EDGE_TERMINATION = 'true';
    expect(isMinioCdnEdgeTerminationEnabled()).toBe(true);
    delete process.env.MINIO_CDN_EDGE_TERMINATION;
    expect(isMinioCdnEdgeTerminationEnabled()).toBe(false);
  });
});
