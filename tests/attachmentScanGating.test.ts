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
    expect(resolveAttachmentScanStatus(null)).toBe('clean');
    expect(isAttachmentViewable(undefined)).toBe(true);
  });

  it('allows clean and skipped attachments to be viewed', () => {
    expect(isAttachmentViewable('clean')).toBe(true);
    expect(isAttachmentViewable('skipped')).toBe(true);
  });

  it('blocks pending, infected, and failed attachments', () => {
    expect(isAttachmentViewable('pending')).toBe(false);
    expect(isAttachmentViewable('infected')).toBe(false);
    expect(isAttachmentViewable('failed')).toBe(false);
  });

  it('returns user-facing blocked messages', () => {
    expect(attachmentScanBlockedMessage('pending')).toContain('Malware scan has not completed');
    expect(attachmentScanBlockedMessage('infected')).toContain('Malware was detected');
    expect(attachmentScanBlockedMessage('failed')).toContain('could not complete');
    expect(attachmentScanBlockedMessage('clean')).toBe('');
  });

  it('maps scan states to access failures', () => {
    expect(evaluateAttachmentScanAccess('clean')).toBeNull();
    expect(evaluateAttachmentScanAccess('pending')).toEqual({
      status: 403,
      code: 'ATTACHMENT_SCAN_PENDING',
      message: attachmentScanBlockedMessage('pending'),
    });
    expect(evaluateAttachmentScanAccess('infected')).toEqual({
      status: 403,
      code: 'ATTACHMENT_SCAN_BLOCKED',
      message: attachmentScanBlockedMessage('infected'),
    });
    expect(evaluateAttachmentScanAccess('failed')).toEqual({
      status: 403,
      code: 'ATTACHMENT_SCAN_BLOCKED',
      message: attachmentScanBlockedMessage('failed'),
    });
  });

  it('sets initial upload scan status from skip flag', () => {
    expect(initialAttachmentScanStatus(true)).toBe('skipped');
    expect(initialAttachmentScanStatus(false)).toBe('pending');
  });
});
