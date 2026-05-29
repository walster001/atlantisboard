import type { Editor } from '@tiptap/core';
import { isAxiosError } from 'axios';
import { notifications } from '@mantine/notifications';
import {
  cardCoverReferencesAttachment,
  collectAttachmentIdsFromDescriptionJson,
  collectReferencedAttachmentIdsFromDescriptionJson,
  stripAttachmentFromDescriptionJsonString,
} from '../../../../shared/cardDescriptionAttachmentRefs.js';
import type { CardDB } from '../../../store/database.js';
import { api } from '../../../utils/api.js';
import {
  beginAttachmentUploadNotification,
  completeAttachmentUploadNotification,
  failAttachmentUploadNotification,
  updateAttachmentUploadNotification,
} from '../../../utils/attachmentUploadNotifications.js';
import {
  discardPendingDescriptionMedia,
  flushPendingDescriptionMediaInJson,
  type DescriptionPendingMediaRegistry,
} from '../../../utils/descriptionPendingMedia.js';
import { normalizeCardFromApi } from '../../../utils/transform.js';
import { serializeCardDescriptionEditor } from '../cardDescriptionEditorSerialize.js';
import { isCardDescriptionEmpty, parseCardDescriptionJson } from '../cardDescriptionTiptap.js';

type DateFieldKind = 'dueDate' | 'startDate' | 'endDate';

interface SharedCardActionArgs {
  readonly card: CardDB;
  readonly syncCardToBoardAndDexie: (card: CardDB) => void;
  readonly notifyNormalizeFailure: () => void;
}

interface DescriptionUpdateArgs extends SharedCardActionArgs {
  readonly editor: Editor | null;
  readonly pendingDescriptionMedia: DescriptionPendingMediaRegistry;
}

interface DeleteAttachmentPreflightArgs {
  readonly cardRef: { current: CardDB };
  readonly descriptionEditorRef: { current: Editor | null };
  readonly attachmentId: string;
  readonly syncCardToBoardAndDexie: (card: CardDB) => void;
  readonly notifyNormalizeFailure: () => void;
}

interface SaveDateFieldArgs extends SharedCardActionArgs {
  readonly kind: DateFieldKind;
  readonly value: string;
  readonly close: () => void;
  readonly label: string;
}

interface ClearDateFieldArgs extends SharedCardActionArgs {
  readonly kind: DateFieldKind;
  readonly close: () => void;
}

export async function runBeforeDeleteAttachment({
  cardRef,
  descriptionEditorRef,
  attachmentId,
  syncCardToBoardAndDexie,
  notifyNormalizeFailure,
}: DeleteAttachmentPreflightArgs): Promise<void> {
  const currentCard = cardRef.current;
  const attachment = currentCard.attachments.find((item) => item.id === attachmentId);
  if (attachment == null) {
    return;
  }
  const referencedInSavedDescription = collectReferencedAttachmentIdsFromDescriptionJson(
    currentCard.description ?? '',
    currentCard.attachments,
  ).has(attachmentId);
  const referencedInLiveEditor = (() => {
    const editor = descriptionEditorRef.current;
    if (editor == null || editor.isDestroyed) {
      return false;
    }
    const serialized = serializeCardDescriptionEditor(editor);
    if (!serialized.ok) {
      return false;
    }
    return collectReferencedAttachmentIdsFromDescriptionJson(serialized.jsonString, currentCard.attachments).has(
      attachmentId,
    );
  })();
  const isCover = cardCoverReferencesAttachment(currentCard.cover, attachmentId, attachment.url);
  if (!referencedInSavedDescription && !referencedInLiveEditor && !isCover) {
    return;
  }

  const rawJsonForStrip = (() => {
    const editor = descriptionEditorRef.current;
    if (editor != null && !editor.isDestroyed) {
      const serialized = serializeCardDescriptionEditor(editor);
      if (serialized.ok) {
        return serialized.jsonString;
      }
    }
    return currentCard.description ?? '';
  })();

  const stripped = stripAttachmentFromDescriptionJsonString(rawJsonForStrip, attachmentId, attachment.url);
  const doc = parseCardDescriptionJson(stripped);
  const descriptionPayload = isCardDescriptionEmpty(doc) ? '' : stripped;

  const response = await api.updateCard(currentCard.id, {
    description: descriptionPayload,
    ...(isCover ? { cover: '' } : {}),
  });
  try {
    const normalized = normalizeCardFromApi((response as { card: unknown }).card, currentCard.id, {
      listId: currentCard.listId,
      boardId: currentCard.boardId,
    });
    const editor = descriptionEditorRef.current;
    if (editor != null && !editor.isDestroyed) {
      editor.commands.setContent(parseCardDescriptionJson(descriptionPayload));
    }
    syncCardToBoardAndDexie(normalized);
  } catch {
    notifyNormalizeFailure();
  }
}

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
            const attachmentId = (response as { attachment?: { id?: unknown } }).attachment?.id;
            if (typeof attachmentId !== 'string' || attachmentId.trim() === '') {
              throw new Error('Upload succeeded but attachment id was missing.');
            }
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

  let normalized = normalizeCardFromApi((response as { card: unknown }).card, card.id, {
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
      normalized = normalizeCardFromApi((refresh as { card: unknown }).card, card.id, {
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

export async function runSaveDateField({
  card,
  kind,
  value,
  close,
  label,
  syncCardToBoardAndDexie,
  notifyNormalizeFailure,
}: SaveDateFieldArgs): Promise<void> {
  if (!value.trim()) {
    notifications.show({ color: 'yellow', title: label, message: 'Choose a date and time.' });
    return;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    notifications.show({ color: 'red', title: 'Invalid date', message: 'Could not read that date.' });
    return;
  }
  const response = await api.updateCard(card.id, { [kind]: parsed.toISOString() });
  try {
    syncCardToBoardAndDexie(normalizeCardFromApi((response as { card: unknown }).card, card.id));
  } catch {
    notifyNormalizeFailure();
  }
  close();
}

export async function runClearDateField({
  card,
  kind,
  close,
  syncCardToBoardAndDexie,
  notifyNormalizeFailure,
}: ClearDateFieldArgs): Promise<void> {
  const response = await api.updateCard(card.id, { [kind]: null });
  try {
    syncCardToBoardAndDexie(normalizeCardFromApi((response as { card: unknown }).card, card.id));
  } catch {
    notifyNormalizeFailure();
  }
  close();
}
