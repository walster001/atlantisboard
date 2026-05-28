import { describe, expect, test } from 'bun:test';
import {
  formatCardAttachmentMaxMb,
  resolveCardAttachmentMaxBytes,
} from '../src/shared/constants/uploadLimits.js';

describe('resolveCardAttachmentMaxBytes', () => {
  test('defaults to 50 MB when env is empty', () => {
    expect(resolveCardAttachmentMaxBytes({})).toBe(50 * 1024 * 1024);
  });

  test('uses CARD_ATTACHMENT_MAX_MB when set', () => {
    expect(resolveCardAttachmentMaxBytes({ CARD_ATTACHMENT_MAX_MB: '100' })).toBe(100 * 1024 * 1024);
  });

  test('uses MAX_FILE_SIZE bytes when MB env is unset', () => {
    expect(resolveCardAttachmentMaxBytes({ MAX_FILE_SIZE: '1048576000' })).toBe(1048576000);
  });

  test('CARD_ATTACHMENT_MAX_MB overrides MAX_FILE_SIZE', () => {
    expect(
      resolveCardAttachmentMaxBytes({
        CARD_ATTACHMENT_MAX_MB: '25',
        MAX_FILE_SIZE: '1048576000',
      }),
    ).toBe(25 * 1024 * 1024);
  });

  test('clamps MB to ceiling', () => {
    expect(resolveCardAttachmentMaxBytes({ CARD_ATTACHMENT_MAX_MB: '9999' })).toBe(1024 * 1024 * 1024);
  });
});

describe('formatCardAttachmentMaxMb', () => {
  test('rounds bytes to MB label', () => {
    expect(formatCardAttachmentMaxMb(1048576000)).toBe(1000);
  });
});
