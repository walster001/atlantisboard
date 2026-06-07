import { describe, it, expect, afterEach } from 'bun:test';

describe('buildAttachmentStreamUrl', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns proxy URL when delivery mode is proxy', async () => {
    process.env.ATTACHMENT_DELIVERY_MODE = 'proxy';
    const { buildAttachmentStreamUrl } = await import('../src/server/services/attachmentService.js');

    const result = await buildAttachmentStreamUrl('att-1', {
      objectName: 'card/obj.mp4',
      contentType: 'video/mp4',
      size: 10_000,
    });

    expect(result.delivery).toBe('proxy');
    expect(result.url).toBe('/api/v1/attachments/att-1/file');
    expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('hybrid returns proxy for video when public MinIO endpoint is unset', async () => {
    process.env.ATTACHMENT_DELIVERY_MODE = 'hybrid';
    delete process.env.MINIO_PUBLIC_ENDPOINT;
    delete process.env.S3_PUBLIC_URL;
    delete process.env.ATTACHMENT_PUBLIC_BASE;
    process.env.MINIO_ENDPOINT = 'minio';
    const { buildAttachmentStreamUrl } = await import('../src/server/services/attachmentService.js');

    const result = await buildAttachmentStreamUrl('vid-1', {
      objectName: 'card/clip.mp4',
      contentType: 'video/mp4',
      size: 10_000,
    });

    expect(result.delivery).toBe('proxy');
    expect(result.url).toBe('/api/v1/attachments/vid-1/file');
  });

  it('hybrid returns proxy for PDF attachments', async () => {
    process.env.ATTACHMENT_DELIVERY_MODE = 'hybrid';
    const { buildAttachmentStreamUrl } = await import('../src/server/services/attachmentService.js');

    const result = await buildAttachmentStreamUrl('pdf-1', {
      objectName: 'card/doc.pdf',
      contentType: 'application/pdf',
      size: 50_000,
    });

    expect(result.delivery).toBe('proxy');
    expect(result.url).toContain('/api/v1/attachments/pdf-1/file');
  });
});
