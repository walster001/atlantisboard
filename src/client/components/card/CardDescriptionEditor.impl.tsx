import { EditorContent, useEditor } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import type { DescriptionPendingMediaRegistry } from '../../utils/descriptionPendingMedia.js';
import type { Editor } from '@tiptap/core';
import { CARD_DESCRIPTION_TEXT_MAX_LENGTH } from '../../../shared/constants/cardDescription.js';
import {
  getCardDescriptionTextLength,
  parseCardDescriptionJson,
  getCardDescriptionEditorExtensions,
} from './cardDescriptionTiptap.js';
import { CardDescriptionInlineButtonEditModal } from './CardDescriptionInlineButtonEditModal.js';
import { CardDescriptionAudioEditModal } from './CardDescriptionAudioEditModal.js';
import { DescriptionCharLimitHint } from './CardDescriptionEditor/descriptionCharLimitHint.js';
import { CardDescriptionEditorToolbar } from './CardDescriptionEditor/Toolbar.js';
import './cardDescriptionTiptap.css';

export interface CardDescriptionEditorProps {
  cardId: string;
  /** Serialized JSON — used as initial document when this component mounts. */
  valueJson: string | undefined | null;
  placeholder?: string;
  minHeightPx?: number;
  onEditorReady?: (editor: Editor | null) => void;
  onJsonByteLengthChange?: (length: number) => void;
  onTextLengthChange?: (length: number) => void;
  pendingDescriptionMediaRef: MutableRefObject<DescriptionPendingMediaRegistry>;
}

export function CardDescriptionEditor({
  cardId,
  valueJson,
  placeholder = 'Write something…',
  minHeightPx = 240,
  onEditorReady,
  onJsonByteLengthChange,
  onTextLengthChange,
  pendingDescriptionMediaRef,
}: CardDescriptionEditorProps) {
  const [inlineButtonEditPos, setInlineButtonEditPos] = useState<number | null>(null);
  const [audioEditPos, setAudioEditPos] = useState<number | null>(null);
  const closeInlineButtonModal = useCallback(() => {
    setInlineButtonEditPos(null);
  }, []);
  const closeAudioModal = useCallback(() => {
    setAudioEditPos(null);
  }, []);

  const initialContent = useMemo(
    () => parseCardDescriptionJson(valueJson ?? ''),
    [valueJson],
  );

  const extensions = useMemo(
    () => getCardDescriptionEditorExtensions(placeholder),
    [placeholder],
  );

  const editor = useEditor(
    {
      extensions,
      content: initialContent,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          class: 'card-desc-tiptap-editor',
        },
      },
    },
    [extensions, initialContent],
  );

  useEffect(() => {
    onEditorReady?.(editor ?? null);
    return () => {
      onEditorReady?.(null);
    };
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const storage = editor.storage.inlineButton;
    if (!storage) {
      return;
    }
    const prev = storage.openEditModal;
    storage.openEditModal = (pos: number) => {
      setInlineButtonEditPos(pos);
    };
    return () => {
      storage.openEditModal = prev;
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const storage = editor.storage.audio;
    if (!storage) {
      return;
    }
    const prev = storage.openEditModal;
    storage.openEditModal = (pos: number) => {
      setAudioEditPos(pos);
    };
    return () => {
      storage.openEditModal = prev;
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    if (!onJsonByteLengthChange && !onTextLengthChange) {
      return;
    }
    const sync = (): void => {
      const doc = editor.getJSON();
      if (onJsonByteLengthChange) {
        const json = JSON.stringify(doc);
        onJsonByteLengthChange(new TextEncoder().encode(json).length);
      }
      if (onTextLengthChange) {
        onTextLengthChange(getCardDescriptionTextLength(doc));
      }
    };
    sync();
    editor.on('update', sync);
    return () => {
      editor.off('update', sync);
    };
  }, [editor, onJsonByteLengthChange, onTextLengthChange]);

  if (!editor) {
    return null;
  }

  return (
    <div
      className="card-desc-tiptap-editor"
      style={{ minHeight: minHeightPx }}
    >
      <CardDescriptionEditorToolbar
        editor={editor}
        pendingDescriptionMediaRef={pendingDescriptionMediaRef}
      />
      <EditorContent editor={editor} />
      <CardDescriptionInlineButtonEditModal
        key={inlineButtonEditPos ?? 'inline-button-closed'}
        opened={inlineButtonEditPos !== null}
        nodePos={inlineButtonEditPos}
        onClose={closeInlineButtonModal}
        editor={editor}
        cardId={cardId}
      />
      <CardDescriptionAudioEditModal
        key={audioEditPos ?? 'audio-closed'}
        opened={audioEditPos !== null}
        nodePos={audioEditPos}
        onClose={closeAudioModal}
        editor={editor}
        cardId={cardId}
      />
      <DescriptionCharLimitHint editor={editor} maxChars={CARD_DESCRIPTION_TEXT_MAX_LENGTH} />
    </div>
  );
}

export { serializeCardDescriptionEditor } from './cardDescriptionEditorSerialize.js';
