import { describe, expect, it } from 'bun:test';
import {
  attachmentScanBlockedMessage,
  evaluateAttachmentScanAccess,
  initialAttachmentScanStatus,
  isAttachmentViewable,
  resolveAttachmentScanStatus,
} from '../src/shared/attachmentScanStatus.js';

describe('attachmentScanStatus', () => {
  it('treats legacy attachments without scanStatus as clean', () => {
    expect(resolveAttachmentScanStatus(undefined)).toBe('clean');
    expect(isAttachmentViewable(undefined)).toBe(true);
    expect(evaluateAttachmentScanAccess(undefined)).toBeNull();
  });

  it('blocks pending, failed, and infected attachments from view', () => {
    expect(isAttachmentViewable('pending')).toBe(false);
    expect(isAttachmentViewable('failed')).toBe(false);
    expect(isAttachmentViewable('infected')).toBe(false);
    expect(isAttachmentViewable('clean')).toBe(true);
    expect(isAttachmentViewable('skipped')).toBe(true);
  });

  it('returns the user-facing pending message', () => {
    expect(attachmentScanBlockedMessage('pending')).toBe(
      'Malware scan has not completed; the file cannot be viewed.',
    );
  });

  it('maps scan access failures to API codes', () => {
    expect(evaluateAttachmentScanAccess('pending')).toEqual({
      status: 403,
      code: 'ATTACHMENT_SCAN_PENDING',
      message: 'Malware scan has not completed; the file cannot be viewed.',
    });
    expect(evaluateAttachmentScanAccess('failed')).toEqual({
      status: 403,
      code: 'ATTACHMENT_SCAN_BLOCKED',
      message: 'Malware scan could not complete; the file cannot be viewed.',
    });
  });

  it('initializes scan status from skip-scan flag', () => {
    expect(initialAttachmentScanStatus(true)).toBe('skipped');
    expect(initialAttachmentScanStatus(false)).toBe('pending');
  });
});
