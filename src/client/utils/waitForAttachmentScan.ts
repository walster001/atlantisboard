import {
  attachmentScanBlockedMessage,
  isAttachmentScanSettled,
  isAttachmentViewable,
  type AttachmentScanStatus,
} from '../../shared/attachmentScanStatus.js';
import { api } from './api.js';
import { normalizeCardFromApi } from './transform.js';

const POLL_INTERVAL_MS = 2_000;
const MAX_WAIT_MS = 600_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type AttachmentScanWaitResult =
  | { readonly kind: 'ready'; readonly scanStatus: AttachmentScanStatus }
  | { readonly kind: 'blocked'; readonly scanStatus: AttachmentScanStatus; readonly message: string }
  | { readonly kind: 'timeout' };

/**
 * Poll card detail until the attachment scan leaves `pending`, or timeout.
 * Socket `card:updated` may arrive sooner; polling covers missed events.
 */
export async function waitForAttachmentScanComplete(
  cardId: string,
  attachmentId: string,
): Promise<AttachmentScanWaitResult> {
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const response = await api.getCard(cardId);
    const card = normalizeCardFromApi(response.card, cardId);
    const attachment = card.attachments.find((att) => att.id === attachmentId);
    if (attachment == null) {
      return { kind: 'blocked', scanStatus: 'failed', message: 'Attachment was removed after upload.' };
    }

    const scanStatus = attachment.scanStatus ?? 'clean';
    if (!isAttachmentScanSettled(scanStatus)) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (isAttachmentViewable(scanStatus)) {
      return { kind: 'ready', scanStatus };
    }

    return {
      kind: 'blocked',
      scanStatus,
      message: attachmentScanBlockedMessage(scanStatus),
    };
  }

  return { kind: 'timeout' };
}
