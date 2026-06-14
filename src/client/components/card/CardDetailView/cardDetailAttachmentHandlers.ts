import {
  cardCoverReferencesAttachment,
  collectReferencedAttachmentIdsFromDescriptionJson,
  stripAttachmentFromDescriptionJsonString,
} from '../../../../shared/cardDescriptionAttachmentRefs.js';
import { isValidCardDescriptionJsonString } from '../../../../shared/validation/cardDescriptionDoc.js';
import { descriptionJsonHasBlobUrls } from '../../../utils/descriptionPendingMedia.js';
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

/**
 * Optional UI-only prep before DELETE /attachments — server delete strips description, cover,
 * and attachments in one request; no separate updateCard preflight.
 */
export async function runBeforeDeleteAttachment({
  cardRef,
  descriptionEditorRef,
  attachmentId,
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

  const editor = descriptionEditorRef.current;
  if (editor == null || editor.isDestroyed) {
    return;
  }

  const rawJsonForStrip = resolveDescriptionJsonForAttachmentStrip(
    currentCard.description ?? '',
    editor,
  );
  const stripped = stripAttachmentFromDescriptionJsonString(rawJsonForStrip, attachmentId, attachment.url);
  const doc = parseCardDescriptionJson(stripped);
  const descriptionPayload = isCardDescriptionEmpty(doc) ? '' : stripped;
  syncDescriptionEditorAfterAttachmentStrip(editor, descriptionPayload);
}
