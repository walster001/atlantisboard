import type { Editor } from '@tiptap/core';
import {
  cardCoverReferencesAttachment,
  collectReferencedAttachmentIdsFromDescriptionJson,
  stripAttachmentFromDescriptionJsonString,
} from '../../../../shared/cardDescriptionAttachmentRefs.js';
import { api } from '../../../utils/api.js';
import { normalizeCardFromApi } from '../../../utils/transform.js';
import { serializeCardDescriptionEditor } from '../cardDescriptionEditorSerialize.js';
import { isCardDescriptionEmpty, parseCardDescriptionJson } from '../cardDescriptionTiptap.js';
import type { DeleteAttachmentPreflightArgs } from './cardDetailViewHandlerTypes.js';

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
    const normalized = normalizeCardFromApi(response.card, currentCard.id, {
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
