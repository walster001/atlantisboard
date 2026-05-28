import { describe, expect, test } from 'bun:test';
import {
  CARD_ATTACHMENT_DEFAULT_MB,
  CARD_ATTACHMENT_MAX_MB_CEILING,
  formatCardAttachmentMaxMb,
  resolveCardAttachmentMaxBytes,
} from '../src/shared/constants/uploadLimits.js';

const mbToBytes = (mb: number): number => mb * 1024 * 1024;

describe('resolveCardAttachmentMaxBytes', () => {
  test('defaults to 1 GB when env is empty', () => {
    expect(resolveCardAttachmentMaxBytes({})).toBe(mbToBytes(CARD_ATTACHMENT_DEFAULT_MB));
    expect(CARD_ATTACHMENT_DEFAULT_MB).toBe(1024);
  });

  test('uses CARD_ATTACHMENT_MAX_MB when set', () => {
    expect(resolveCardAttachmentMaxBytes({ CARD_ATTACHMENT_MAX_MB: '100' })).toBe(mbToBytes(100));
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
    ).toBe(mbToBytes(25));
  });

  test('clamps MB to 4 GB ceiling', () => {
    expect(resolveCardAttachmentMaxBytes({ CARD_ATTACHMENT_MAX_MB: '9999' })).toBe(
      mbToBytes(CARD_ATTACHMENT_MAX_MB_CEILING),
    );
    expect(CARD_ATTACHMENT_MAX_MB_CEILING).toBe(4000);
  });

  test('clamps legacy MAX_FILE_SIZE to ceiling', () => {
    const overCeilingBytes = 5000 * 1024 * 1024;
    expect(resolveCardAttachmentMaxBytes({ MAX_FILE_SIZE: String(overCeilingBytes) })).toBe(
      mbToBytes(CARD_ATTACHMENT_MAX_MB_CEILING),
    );
  });
});

describe('formatCardAttachmentMaxMb', () => {
  test('rounds bytes to MB label', () => {
    expect(formatCardAttachmentMaxMb(1048576000)).toBe(1000);
    expect(formatCardAttachmentMaxMb(mbToBytes(CARD_ATTACHMENT_DEFAULT_MB))).toBe(1024);
  });
});
