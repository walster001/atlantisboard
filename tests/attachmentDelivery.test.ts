import { describe, it, expect, afterEach } from 'bun:test';
import {
  clampAttachmentSignedUrlTtlSec,
  getMinioPublicOrigin,
  isMinioCdnProxyEnabled,
  isMinioPublicPresignConfigured,
  parseAttachmentDeliveryMode,
  resolveAttachmentDeliveryKind,
  resolveMinioPublicEndpointConfig,
} from '../src/server/config/attachmentDelivery.js';

describe('attachmentDelivery config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('parses delivery mode with hybrid default', () => {
    delete process.env.ATTACHMENT_DELIVERY_MODE;
    expect(parseAttachmentDeliveryMode(undefined)).toBe('hybrid');
    expect(parseAttachmentDeliveryMode('signed')).toBe('signed');
    expect(parseAttachmentDeliveryMode('proxy')).toBe('proxy');
    expect(parseAttachmentDeliveryMode('invalid')).toBe('hybrid');
  });

  it('clamps signed URL TTL between 60 and 3600', () => {
    expect(clampAttachmentSignedUrlTtlSec(undefined)).toBe(900);
    expect(clampAttachmentSignedUrlTtlSec('30')).toBe(60);
    expect(clampAttachmentSignedUrlTtlSec('99999')).toBe(3600);
    expect(clampAttachmentSignedUrlTtlSec('1200')).toBe(1200);
  });

  it('hybrid prefers signed for video and proxy for PDF', () => {
    expect(
      resolveAttachmentDeliveryKind({
        mode: 'hybrid',
        contentType: 'video/mp4',
        size: 1000,
      }),
    ).toBe('signed');
    expect(
      resolveAttachmentDeliveryKind({
        mode: 'hybrid',
        contentType: 'application/pdf',
        size: 50_000_000,
      }),
    ).toBe('proxy');
  });

  it('always signs video even when delivery mode is proxy', () => {
    expect(
      resolveAttachmentDeliveryKind({
        mode: 'proxy',
        contentType: 'video/webm',
        size: 500,
      }),
    ).toBe('signed');
    expect(
      resolveAttachmentDeliveryKind({
        mode: 'proxy',
        contentType: 'image/png',
        size: 500,
      }),
    ).toBe('proxy');
  });

  it('hybrid signs large non-video files', () => {
    process.env.ATTACHMENT_HYBRID_SIGNED_MIN_BYTES = '1000';
    expect(
      resolveAttachmentDeliveryKind({
        mode: 'hybrid',
        contentType: 'application/octet-stream',
        size: 2000,
      }),
    ).toBe('signed');
    expect(
      resolveAttachmentDeliveryKind({
        mode: 'hybrid',
        contentType: 'application/octet-stream',
        size: 500,
      }),
    ).toBe('proxy');
  });

  it('derives MinIO public origin from MINIO_PUBLIC_*', () => {
    process.env.MINIO_ENDPOINT = 'minio';
    process.env.MINIO_PUBLIC_ENDPOINT = 'cdn.example.com';
    process.env.MINIO_PUBLIC_PORT = '443';
    process.env.MINIO_PUBLIC_USE_SSL = 'true';
    expect(getMinioPublicOrigin()).toBe('https://cdn.example.com');
    expect(isMinioPublicPresignConfigured()).toBe(true);
  });

  it('does not treat internal MINIO_ENDPOINT as public origin', () => {
    delete process.env.MINIO_PUBLIC_ENDPOINT;
    delete process.env.MINIO_PUBLIC_PORT;
    delete process.env.MINIO_PUBLIC_USE_SSL;
    delete process.env.S3_PUBLIC_URL;
    delete process.env.ATTACHMENT_PUBLIC_BASE;
    process.env.MINIO_ENDPOINT = 'minio';
    process.env.MINIO_PORT = '9000';
    expect(getMinioPublicOrigin()).toBeNull();
    expect(isMinioPublicPresignConfigured()).toBe(false);
  });

  it('rejects MINIO_PUBLIC_ENDPOINT that matches internal endpoint in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.MINIO_ENDPOINT = 'minio';
    process.env.MINIO_PUBLIC_ENDPOINT = 'minio';
    process.env.MINIO_PUBLIC_PORT = '9000';
    expect(isMinioPublicPresignConfigured()).toBe(false);
    expect(getMinioPublicOrigin()).toBeNull();
  });

  it('allows localhost public presign in development when internal is also localhost', () => {
    process.env.NODE_ENV = 'development';
    process.env.MINIO_ENDPOINT = 'localhost';
    process.env.MINIO_PUBLIC_ENDPOINT = 'localhost';
    process.env.MINIO_PUBLIC_PORT = '9000';
    process.env.MINIO_PUBLIC_USE_SSL = 'false';
    expect(isMinioPublicPresignConfigured()).toBe(true);
    expect(getMinioPublicOrigin()).toBe('http://localhost:9000');
  });

  it('defaults scheme-less S3_PUBLIC_URL to http in development', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.MINIO_PUBLIC_ENDPOINT;
    process.env.MINIO_ENDPOINT = '127.0.0.1';
    process.env.S3_PUBLIC_URL = 'localhost:9000';
    expect(isMinioPublicPresignConfigured()).toBe(true);
    expect(getMinioPublicOrigin()).toBe('http://localhost:9000');
  });

  it('rejects docker internal hostname even in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.MINIO_ENDPOINT = 'localhost';
    process.env.MINIO_PUBLIC_ENDPOINT = 'minio';
    process.env.MINIO_PUBLIC_PORT = '9000';
    expect(isMinioPublicPresignConfigured()).toBe(false);
  });

  it('parses S3_PUBLIC_URL without path as external presign endpoint', () => {
    delete process.env.MINIO_PUBLIC_ENDPOINT;
    process.env.S3_PUBLIC_URL = 'https://storage.example.com';
    expect(isMinioPublicPresignConfigured()).toBe(true);
    expect(getMinioPublicOrigin()).toBe('https://storage.example.com');
  });

  it('treats S3_PUBLIC_URL with path as CDN proxy base, not external host', () => {
    delete process.env.MINIO_PUBLIC_ENDPOINT;
    delete process.env.MINIO_CDN_PATH_PREFIX;
    process.env.S3_PUBLIC_URL = 'http://localhost:3000/cdn';
    expect(isMinioCdnProxyEnabled()).toBe(true);
    expect(isMinioPublicPresignConfigured()).toBe(true);
    expect(getMinioPublicOrigin()).toBeNull();
    expect(resolveMinioPublicEndpointConfig()).toBeNull();
  });
});
