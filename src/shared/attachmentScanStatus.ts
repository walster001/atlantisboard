export const ATTACHMENT_SCAN_STATUSES = [
  'pending',
  'clean',
  'infected',
  'failed',
  'skipped',
] as const;

export type AttachmentScanStatus = (typeof ATTACHMENT_SCAN_STATUSES)[number];

/** Legacy attachments without `scanStatus` were scanned synchronously before storage. */
export function resolveAttachmentScanStatus(
  raw: AttachmentScanStatus | undefined | null,
): AttachmentScanStatus {
  if (raw == null) {
    return 'clean';
  }
  return raw;
}

export function isAttachmentViewable(scanStatus: AttachmentScanStatus | undefined | null): boolean {
  const resolved = resolveAttachmentScanStatus(scanStatus);
  return resolved === 'clean' || resolved === 'skipped';
}

export function attachmentScanBlockedMessage(
  scanStatus: AttachmentScanStatus | undefined | null,
): string {
  const resolved = resolveAttachmentScanStatus(scanStatus);
  switch (resolved) {
    case 'pending':
      return 'Malware scan has not completed; the file cannot be viewed.';
    case 'infected':
      return 'Malware was detected in this file; it has been blocked and removed from storage.';
    case 'failed':
      return 'Malware scan could not complete; the file cannot be viewed.';
    case 'clean':
    case 'skipped':
      return '';
  }
}

export type AttachmentScanAccessCode =
  | 'ATTACHMENT_SCAN_PENDING'
  | 'ATTACHMENT_SCAN_BLOCKED';

export type AttachmentScanAccessFailure = {
  readonly status: 403;
  readonly code: AttachmentScanAccessCode;
  readonly message: string;
};

/** Returns a 403 failure when the attachment is not yet viewable; null when access may proceed. */
export function evaluateAttachmentScanAccess(
  scanStatus: AttachmentScanStatus | undefined | null,
): AttachmentScanAccessFailure | null {
  if (isAttachmentViewable(scanStatus)) {
    return null;
  }
  const resolved = resolveAttachmentScanStatus(scanStatus);
  return {
    status: 403,
    code: resolved === 'pending' ? 'ATTACHMENT_SCAN_PENDING' : 'ATTACHMENT_SCAN_BLOCKED',
    message: attachmentScanBlockedMessage(resolved),
  };
}

export function initialAttachmentScanStatus(skipScan: boolean): AttachmentScanStatus {
  return skipScan ? 'skipped' : 'pending';
}
