import { describe, it, expect, afterEach } from 'bun:test';
import {
  clampAttachmentSignedUrlTtlSec,
  getMinioPublicOrigin,
  parseAttachmentDeliveryMode,
  resolveAttachmentDeliveryKind,
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
    process.env.MINIO_PUBLIC_ENDPOINT = 'cdn.example.com';
    process.env.MINIO_PUBLIC_PORT = '443';
    process.env.MINIO_PUBLIC_USE_SSL = 'true';
    expect(getMinioPublicOrigin()).toBe('https://cdn.example.com');
  });
});
