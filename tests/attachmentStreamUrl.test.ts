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
