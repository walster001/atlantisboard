import {
  attachmentScanBlockedMessage,
  isAttachmentViewable,
} from '../../shared/attachmentScanStatus.js';
import { api } from './api.js';
import {
  requireUploadedAttachmentId,
  uploadScanCompletesImmediately,
  type AttachmentUploadResponse,
} from './api/attachmentApiMethods.js';
import {
  completeAttachmentUploadNotification,
  failAttachmentUploadNotification,
  showMalwareScanNotification,
} from './attachmentUploadNotifications.js';
import { normalizeCardFromApi } from './transform.js';
import { waitForAttachmentScanComplete } from './waitForAttachmentScan.js';

/**
 * After HTTP upload completes, keep the Mantine notification open until malware scan settles.
 */
export async function finalizeAttachmentUploadNotification(args: {
  readonly cardId: string;
  readonly label: string;
  readonly uploadResponse: AttachmentUploadResponse;
}): Promise<void> {
  const { cardId, label, uploadResponse } = args;

  if (uploadScanCompletesImmediately(uploadResponse)) {
    completeAttachmentUploadNotification(label);
    return;
  }

  const attachmentId = requireUploadedAttachmentId(uploadResponse);
  showMalwareScanNotification(label);

  const outcome = await waitForAttachmentScanComplete(cardId, attachmentId);
  if (outcome.kind === 'ready') {
    completeAttachmentUploadNotification(label);
    return;
  }

  if (outcome.kind === 'timeout') {
    failAttachmentUploadNotification(
      'Malware scan is taking longer than expected. The file will become available when the scan finishes.',
    );
    return;
  }

  const message =
    outcome.message.trim() !== ''
      ? outcome.message
      : attachmentScanBlockedMessage(outcome.scanStatus);
  failAttachmentUploadNotification(message);
}

export async function refreshCardAfterUpload(cardId: string, fallbackCardId?: string) {
  const response = await api.getCard(cardId);
  return normalizeCardFromApi(response.card, fallbackCardId ?? cardId);
}

export { isAttachmentViewable };
