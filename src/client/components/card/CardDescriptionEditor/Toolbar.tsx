import { useEditorState } from '@tiptap/react';
import { memo, useCallback, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Editor } from '@tiptap/core';
import { BOARD_PRESET_COLOURS, normalizePresetHex } from '../../../constants/boardPresetColors.js';
import {
  CARD_DETAIL_MODAL_BACKGROUND_RGB,
  CARD_DETAIL_SECTION_HEADING_RGB,
  parseCssColorToRgbTriplet,
} from '../cardDetailSectionUi.js';
import {
  registerPendingDescriptionMediaFile,
  type DescriptionPendingMediaRegistry,
} from '../../../utils/descriptionPendingMedia.js';
import { prefetchEmojiMartModules } from './emojiMartPicker.js';
import {
  EDITOR_TEXT_COLOR_FALLBACK,
} from './toolbarConfig.js';
import { useResponsiveTier } from '../../../hooks/useResponsiveTier.js';
import { ToolbarContent } from './ToolbarContent.js';

interface CardDescriptionEditorToolbarProps {
  readonly editor: Editor;
  readonly pendingDescriptionMediaRef: MutableRefObject<DescriptionPendingMediaRegistry>;
}

export interface ToolbarUiState {
  readonly activeBold: boolean;
  readonly activeItalic: boolean;
  readonly activeStrike: boolean;
  readonly activeUnderline: boolean;
  readonly activeHeading: boolean;
  readonly alignCenter: boolean;
  readonly alignRight: boolean;
  readonly alignJustify: boolean;
  readonly activeBulletList: boolean;
  readonly activeOrderedList: boolean;
  readonly activeBlockquote: boolean;
  readonly activeCodeBlock: boolean;
  readonly activeParagraph: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly hasTextColor: boolean;
  readonly hasCustomFontSize: boolean;
  readonly fontSizeRaw: string;
  readonly hasCustomLineHeight: boolean;
  readonly lineHeightRaw: string;
}

export const CardDescriptionEditorToolbar = memo(function CardDescriptionEditorToolbar({
  editor,
  pendingDescriptionMediaRef,
}: CardDescriptionEditorToolbarProps) {
  const isMobile = useResponsiveTier() === 'mobile';
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false);
  const [emojiPopoverOpen, setEmojiPopoverOpen] = useState(false);
  const [textColorPickerValue, setTextColorPickerValue] = useState(EDITOR_TEXT_COLOR_FALLBACK);

  const emojiRgbProbeBgRef = useRef<HTMLSpanElement>(null);
  const emojiRgbProbeFgRef = useRef<HTMLSpanElement>(null);
  const [emojiMartRgbBackground, setEmojiMartRgbBackground] = useState(CARD_DETAIL_MODAL_BACKGROUND_RGB);
  const [emojiMartRgbColor, setEmojiMartRgbColor] = useState(CARD_DETAIL_SECTION_HEADING_RGB);

  const syncEmojiMartRgbFromCssVars = useCallback((): void => {
    const bgEl = emojiRgbProbeBgRef.current;
    const fgEl = emojiRgbProbeFgRef.current;
    if (bgEl != null) {
      const triplet = parseCssColorToRgbTriplet(getComputedStyle(bgEl).backgroundColor);
      if (triplet != null) {
        setEmojiMartRgbBackground(triplet);
      }
    }
    if (fgEl != null) {
      const triplet = parseCssColorToRgbTriplet(getComputedStyle(fgEl).color);
      if (triplet != null) {
        setEmojiMartRgbColor(triplet);
      }
    }
  }, []);

  useLayoutEffect(() => {
    syncEmojiMartRgbFromCssVars();
  }, [syncEmojiMartRgbFromCssVars]);

  useLayoutEffect(() => {
    if (emojiPopoverOpen) {
      syncEmojiMartRgbFromCssVars();
    }
  }, [emojiPopoverOpen, syncEmojiMartRgbFromCssVars]);

  const ui = useEditorState({
    editor,
    selector: ({ editor: ed }): ToolbarUiState => {
      const textStyleAttrs = ed.getAttributes('textStyle');
      const textColor = typeof textStyleAttrs.color === 'string' ? textStyleAttrs.color.trim() : '';
      const fontSizeRaw =
        typeof textStyleAttrs.fontSize === 'string' ? textStyleAttrs.fontSize.trim() : '';
      const headingLhRaw = ed.getAttributes('heading').lineHeight;
      const paraLhRaw = ed.getAttributes('paragraph').lineHeight;
      const lineHeightRaw =
        ed.isActive('heading') && typeof headingLhRaw === 'string'
          ? headingLhRaw.trim()
          : typeof paraLhRaw === 'string'
            ? paraLhRaw.trim()
            : '';
      return {
        activeBold: ed.isActive('bold'),
        activeItalic: ed.isActive('italic'),
        activeStrike: ed.isActive('strike'),
        activeUnderline: ed.isActive('underline'),
        activeHeading: ed.isActive('heading'),
        alignCenter: ed.isActive({ textAlign: 'center' }),
        alignRight: ed.isActive({ textAlign: 'right' }),
        alignJustify: ed.isActive({ textAlign: 'justify' }),
        activeBulletList: ed.isActive('bulletList'),
        activeOrderedList: ed.isActive('orderedList'),
        activeBlockquote: ed.isActive('blockquote'),
        activeCodeBlock: ed.isActive('codeBlock'),
        activeParagraph: ed.isActive('paragraph'),
        canUndo: ed.can().chain().focus().undo().run(),
        canRedo: ed.can().chain().focus().redo().run(),
        hasTextColor: ed.isActive('textStyle') && textColor !== '',
        hasCustomFontSize: fontSizeRaw !== '',
        fontSizeRaw,
        hasCustomLineHeight: lineHeightRaw !== '',
        lineHeightRaw,
      };
    },
  });

  const handleColorPopoverChange = (open: boolean): void => {
    setColorPopoverOpen(open);
    if (!open) {
      return;
    }
    const raw = editor.getAttributes('textStyle').color;
    if (typeof raw === 'string' && raw.trim() !== '') {
      setTextColorPickerValue(normalizePresetHex(raw.trim(), BOARD_PRESET_COLOURS));
    } else {
      setTextColorPickerValue(EDITOR_TEXT_COLOR_FALLBACK);
    }
  };

  const handleEmojiPopoverChange = (open: boolean): void => {
    setEmojiPopoverOpen(open);
    if (open) {
      void prefetchEmojiMartModules();
    }
  };

  const handleInsertImage = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file == null) {
        return;
      }
      const src = registerPendingDescriptionMediaFile(pendingDescriptionMediaRef.current, file);
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'imageResize',
          attrs: { src, alt: file.name },
        })
        .run();
    };
    input.click();
  };

  const handleInsertVideo = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file == null) {
        return;
      }
      const src = registerPendingDescriptionMediaFile(pendingDescriptionMediaRef.current, file);
      editor.chain().focus().setVideo({ src }).run();
    };
    input.click();
  };

  const handleEmojiPick = (payload: unknown): void => {
    if (typeof payload !== 'object' || payload == null) {
      return;
    }
    const native = (payload as { native?: unknown }).native;
    if (typeof native !== 'string' || native.trim() === '') {
      return;
    }
    editor.chain().focus().insertEmoji({ emoji: native }).run();
    setEmojiPopoverOpen(false);
  };

  return (
    <ToolbarContent
      editor={editor}
      ui={ui}
      isMobile={isMobile}
      colorPopoverOpen={colorPopoverOpen}
      emojiPopoverOpen={emojiPopoverOpen}
      textColorPickerValue={textColorPickerValue}
      isMediaUploadBusy={false}
      emojiMartRgbBackground={emojiMartRgbBackground}
      emojiMartRgbColor={emojiMartRgbColor}
      emojiRgbProbeBgRef={emojiRgbProbeBgRef}
      emojiRgbProbeFgRef={emojiRgbProbeFgRef}
      onColorPopoverChange={handleColorPopoverChange}
      onEmojiPopoverChange={handleEmojiPopoverChange}
      onTextColorChange={(hex) => {
        setTextColorPickerValue(hex);
        editor.chain().focus().setColor(hex).run();
      }}
      onClearTextColor={() => {
        editor.chain().focus().unsetColor().run();
        setTextColorPickerValue(EDITOR_TEXT_COLOR_FALLBACK);
        setColorPopoverOpen(false);
      }}
      onEmojiPick={handleEmojiPick}
      onInsertImage={handleInsertImage}
      onInsertVideo={handleInsertVideo}
    />
  );
});
