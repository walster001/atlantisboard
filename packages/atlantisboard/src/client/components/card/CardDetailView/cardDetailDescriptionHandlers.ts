import { isAxiosError } from 'axios';
import {
  collectAttachmentIdsFromDescriptionJson,
  collectReferencedAttachmentIdsFromDescriptionJson,
} from '../../../../shared/cardDescriptionAttachmentRefs.js';
import { api } from '../../../utils/api.js';
import { requireUploadedAttachmentId } from '../../../utils/api/attachmentApiMethods.js';
import {
  beginAttachmentUploadNotification,
  completeAttachmentUploadNotification,
  failAttachmentUploadNotification,
  updateAttachmentUploadNotification,
} from '../../../utils/attachmentUploadNotifications.js';
import {
  discardPendingDescriptionMedia,
  flushPendingDescriptionMediaInJson,
} from '../../../utils/descriptionPendingMedia.js';
import { normalizeCardFromApi } from '../../../utils/transform.js';
import { serializeCardDescriptionEditor } from '../cardDescriptionEditorSerialize.js';
import { isCardDescriptionEmpty, parseCardDescriptionJson } from '../cardDescriptionTiptap.js';
import type { DescriptionUpdateArgs } from './cardDetailViewHandlerTypes.js';

export async function runDescriptionUpdate({
  card,
  editor,
  syncCardToBoardAndDexie,
  notifyNormalizeFailure,
  pendingDescriptionMedia,
}: DescriptionUpdateArgs): Promise<{ ok: boolean; reason?: string }> {
  const serialized = serializeCardDescriptionEditor(editor);
  if (!serialized.ok) {
    return { ok: false, reason: serialized.reason };
  }
  const doc = parseCardDescriptionJson(serialized.jsonString);
  const isEmpty = isCardDescriptionEmpty(doc);
  let descriptionPayload = isEmpty ? '' : serialized.jsonString;

  if (!isEmpty && pendingDescriptionMedia.size > 0) {
    try {
      descriptionPayload = await flushPendingDescriptionMediaInJson(
        serialized.jsonString,
        pendingDescriptionMedia,
        async (file, onProgress) => {
          const label = file.name.trim() !== '' ? file.name : 'Attachment';
          beginAttachmentUploadNotification(label);
          try {
            const response = await api.uploadCardAttachment(card.id, file, (progress) => {
              updateAttachmentUploadNotification(label, progress);
              onProgress?.(progress);
            });
            const attachmentId = requireUploadedAttachmentId(response);
            completeAttachmentUploadNotification(label);
            return api.getAttachmentFileUrl(attachmentId);
          } catch (error) {
            failAttachmentUploadNotification(
              error instanceof Error ? error.message : 'Could not upload file.',
            );
            throw error;
          }
        },
      );
    } catch {
      return { ok: false, reason: 'Could not upload description media.' };
    }
  }

  discardPendingDescriptionMedia(pendingDescriptionMedia);
  const previousAttachmentIds = new Set<string>([
    ...collectAttachmentIdsFromDescriptionJson(card.description ?? ''),
    ...collectReferencedAttachmentIdsFromDescriptionJson(card.description ?? '', card.attachments),
  ]);
  const response = await api.updateCard(card.id, { description: descriptionPayload });

  let normalized = normalizeCardFromApi(response.card, card.id, {
    listId: card.listId,
    boardId: card.boardId,
    position: card.position,
    ...(typeof card.pos === 'number' && Number.isFinite(card.pos) ? { pos: card.pos } : {}),
  });
  const descriptionForNextRefs = isEmpty ? '' : descriptionPayload;
  const nextAttachmentIds = new Set<string>([
    ...collectAttachmentIdsFromDescriptionJson(descriptionForNextRefs),
    ...collectReferencedAttachmentIdsFromDescriptionJson(descriptionForNextRefs, normalized.attachments),
  ]);
  const attachmentIdsRemovedFromDescription = [...previousAttachmentIds].filter((id) => !nextAttachmentIds.has(id));

  for (const attachmentId of attachmentIdsRemovedFromDescription) {
    try {
      await api.deleteCardAttachment(card.id, attachmentId);
    } catch (error) {
      console.error('Failed to delete attachment unreferenced by description:', error);
    }
  }

  if (attachmentIdsRemovedFromDescription.length > 0) {
    try {
      const refresh = await api.getCard(card.id);
      normalized = normalizeCardFromApi(refresh.card, card.id, {
        listId: card.listId,
        boardId: card.boardId,
        position: card.position,
        ...(typeof card.pos === 'number' && Number.isFinite(card.pos) ? { pos: card.pos } : {}),
      });
    } catch (error) {
      console.error('Failed to refresh card after attachment cleanup:', error);
    }
  }

  try {
    syncCardToBoardAndDexie(normalized);
  } catch {
    notifyNormalizeFailure();
  }
  return { ok: true };
}

export function buildDescriptionErrorMessage(error: unknown): string {
  let message = 'Could not save the description.';
  if (isAxiosError(error) && error.response?.status === 400) {
    const data = error.response.data as { error?: { message?: string; details?: unknown } } | undefined;
    const detailMessage = data?.error?.message;
    const issues = data?.error?.details;
    if (typeof detailMessage === 'string' && detailMessage.trim() !== '') {
      message = detailMessage;
    }
    if (Array.isArray(issues) && issues.length > 0) {
      const first = issues[0] as { message?: string; path?: unknown };
      const part =
        typeof first?.message === 'string'
          ? first.message
          : typeof first?.path !== 'undefined'
            ? JSON.stringify(first.path)
            : '';
      if (part !== '') {
        message = `${message} ${part}`.trim();
      }
    }
  }
  return message;
}
