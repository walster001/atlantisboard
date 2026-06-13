import {
  cardCoverReferencesAttachment,
  collectReferencedAttachmentIdsFromDescriptionJson,
  stripAttachmentFromDescriptionJsonString,
} from '../../../../shared/cardDescriptionAttachmentRefs.js';
import { isValidCardDescriptionJsonString } from '../../../../shared/validation/cardDescriptionDoc.js';
import { api } from '../../../utils/api.js';
import { descriptionJsonHasBlobUrls } from '../../../utils/descriptionPendingMedia.js';
import { normalizeCardFromApi } from '../../../utils/transform.js';
import { serializeCardDescriptionEditor } from '../cardDescriptionEditorSerialize.js';
import { isCardDescriptionEmpty, parseCardDescriptionJson } from '../cardDescriptionTiptap.js';
import type { Editor } from '@tiptap/core';
import type { DeleteAttachmentPreflightArgs } from './cardDetailViewHandlerTypes.js';

function resolveDescriptionJsonForAttachmentStrip(
  savedDescription: string,
  editor: Editor | null,
): string {
  if (editor == null || editor.isDestroyed) {
    return savedDescription;
  }
  const serialized = serializeCardDescriptionEditor(editor);
  if (!serialized.ok) {
    return savedDescription;
  }
  const liveJson = serialized.jsonString;
  if (
    descriptionJsonHasBlobUrls(liveJson) ||
    !isValidCardDescriptionJsonString(liveJson)
  ) {
    return savedDescription;
  }
  return liveJson;
}

function syncDescriptionEditorAfterAttachmentStrip(
  editor: Editor,
  descriptionPayload: string,
): void {
  const nextDoc = parseCardDescriptionJson(descriptionPayload);
  requestAnimationFrame(() => {
    if (editor.isDestroyed) {
      return;
    }
    editor.commands.setContent(nextDoc, { emitUpdate: false });
  });
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

  const savedDescription = currentCard.description ?? '';
  const rawJsonForStrip = resolveDescriptionJsonForAttachmentStrip(
    savedDescription,
    descriptionEditorRef.current,
  );

  const stripped = stripAttachmentFromDescriptionJsonString(rawJsonForStrip, attachmentId, attachment.url);
  const doc = parseCardDescriptionJson(stripped);
  const descriptionPayload = isCardDescriptionEmpty(doc) ? '' : stripped;

  const response = await api.updateCard(currentCard.id, {
    description: descriptionPayload,
    ...(isCover ? { cover: '' } : {}),
  });
  try {
    const normalized = normalizeCardFromApi(response.card, currentCard.id, {
      listId: currentCard.listId,
      boardId: currentCard.boardId,
    });
    const editor = descriptionEditorRef.current;
    if (editor != null && !editor.isDestroyed) {
      syncDescriptionEditorAfterAttachmentStrip(editor, descriptionPayload);
    }
    syncCardToBoardAndDexie(normalized);
  } catch {
    notifyNormalizeFailure();
  }
}
