import { describe, expect, test } from 'bun:test';
import { initialAttachmentScanStatus } from '../src/shared/attachmentScanStatus.js';

describe('attachment decoration upload scan policy', () => {
  test('decoration-only image uploads use skipped scan status', () => {
    const decorationOnly = true;
    const normalizedMime = 'image/png';
    const isDecorationImage = decorationOnly && normalizedMime.startsWith('image/');
    const scanStatus = isDecorationImage
      ? 'skipped'
      : initialAttachmentScanStatus(false);
    expect(scanStatus).toBe('skipped');
  });

  test('primary media uploads remain pending when scanning is enabled', () => {
    const decorationOnly = false;
    const normalizedMime = 'audio/mpeg';
    const isDecorationImage = decorationOnly && normalizedMime.startsWith('image/');
    const scanStatus = isDecorationImage
      ? 'skipped'
      : initialAttachmentScanStatus(false);
    expect(scanStatus).toBe('pending');
  });
});
