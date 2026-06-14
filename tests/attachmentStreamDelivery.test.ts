import { describe, expect, test, afterEach } from 'bun:test';
import { shouldPresignRedirectAttachmentStream } from '../src/server/services/attachmentService/streamDelivery.js';

describe('shouldPresignRedirectAttachmentStream', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('redirects video when public MinIO presign is configured', () => {
    process.env.NODE_ENV = 'development';
    process.env.ATTACHMENT_DELIVERY_MODE = 'hybrid';
    process.env.MINIO_ENDPOINT = '127.0.0.1';
    process.env.MINIO_PUBLIC_ENDPOINT = 'localhost';
    process.env.MINIO_PUBLIC_PORT = '9000';
    process.env.MINIO_PUBLIC_USE_SSL = 'false';

    expect(
      shouldPresignRedirectAttachmentStream({
        contentType: 'video/mp4',
        size: 152_973_971,
        hasImagePreviewQuery: false,
      }),
    ).toBe(true);
  });

  test('does not redirect when image preview query is present', () => {
    process.env.NODE_ENV = 'development';
    process.env.ATTACHMENT_DELIVERY_MODE = 'hybrid';
    process.env.MINIO_PUBLIC_ENDPOINT = 'localhost';
    process.env.MINIO_PUBLIC_PORT = '9000';

    expect(
      shouldPresignRedirectAttachmentStream({
        contentType: 'image/jpeg',
        size: 4_000_000,
        hasImagePreviewQuery: true,
      }),
    ).toBe(false);
  });

  test('does not redirect when only internal MinIO endpoint is configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.ATTACHMENT_DELIVERY_MODE = 'hybrid';
    process.env.MINIO_ENDPOINT = 'minio';
    delete process.env.MINIO_PUBLIC_ENDPOINT;
    delete process.env.S3_PUBLIC_URL;

    expect(
      shouldPresignRedirectAttachmentStream({
        contentType: 'video/mp4',
        size: 152_973_971,
        hasImagePreviewQuery: false,
      }),
    ).toBe(false);
  });
});
