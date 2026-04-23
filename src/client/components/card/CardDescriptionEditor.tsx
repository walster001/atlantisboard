import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { Editor } from '@tiptap/core';
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Menu,
  Popover,
  Stack,
  Tooltip,
} from '@mantine/core';
import {
  IconAlignCenter,
  IconAlignJustified,
  IconAlignLeft,
  IconAlignRight,
  IconArrowAutofitHeight,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBlockquote,
  IconBold,
  IconCode,
  IconMoodSmile,
  IconPhoto,
  IconHeading,
  IconItalic,
  IconList,
  IconListNumbers,
  IconPalette,
  IconRowInsertTop,
  IconSeparator,
  IconStrikethrough,
  IconTextSize,
  IconUnderline,
  IconVideo,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { BoardColourPickerPanel } from '../board/BoardColourPickerPanel.js';
import {
  BOARD_PRESET_COLOURS,
  normalizePresetHex,
} from '../../constants/boardPresetColors.js';
import { CARD_DESCRIPTION_TEXT_MAX_LENGTH } from '../../../shared/constants/cardDescription.js';
import { EMOJI_DATASOURCE_TWITTER_SPRITESHEET_64_PUBLIC_PATH } from '../../../shared/twemojiPublic.js';
import {
  getCardDescriptionTextLength,
  parseCardDescriptionJson,
  getCardDescriptionEditorExtensions,
} from './cardDescriptionTiptap.js';
import {
  CARD_DETAIL_EMOJI_MART_INPUT_FOCUS_RGB,
  CARD_DETAIL_MODAL_BACKGROUND_HEX,
  CARD_DETAIL_MODAL_BACKGROUND_RGB,
  CARD_DETAIL_SECTION_HEADING_RGB,
  parseCssColorToRgbTriplet,
} from './cardDetailSectionUi.js';
import { api } from '../../utils/api.js';
import { CardDescriptionInlineButtonEditModal } from './CardDescriptionInlineButtonEditModal.js';
import './cardDescriptionTiptap.css';

/** Shown in the colour picker when the selection has no text colour yet. */
const EDITOR_TEXT_COLOR_FALLBACK =
  BOARD_PRESET_COLOURS[9] ?? '#344563';

const FONT_SIZE_PX_PRESETS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36] as const;
const LINE_HEIGHT_PRESETS = ['1', '1.1', '1.15', '1.2', '1.35', '1.5', '1.75', '2'] as const;
const TOOLBAR_BUTTON_SIZE = 'md';
const TOOLBAR_ICON_SIZE = 22;

function applyBlockLineHeight(editor: Editor, lineHeight: string | null): void {
  const chain = editor.chain().focus();
  if (lineHeight == null) {
    if (editor.isActive('heading')) {
      chain.resetAttributes('heading', 'lineHeight').run();
    } else if (editor.isActive('paragraph')) {
      chain.resetAttributes('paragraph', 'lineHeight').run();
    }
    return;
  }
  if (editor.isActive('heading')) {
    chain.updateAttributes('heading', { lineHeight }).run();
    return;
  }
  if (editor.isActive('paragraph')) {
    chain.updateAttributes('paragraph', { lineHeight }).run();
  }
}

interface EmojiMartLazyProps {
  onEmojiSelect: (payload: unknown) => void;
  rgbBackground: string;
  rgbColor: string;
}

/**
 * emoji-mart shadow DOM: single scroll surface (`.scroll`) for all categories; `#nav` only
 * calls `scrollTo` on click. Wheel stays on `.scroll` (overscroll contain); scrollbar track always shown.
 */
const EMOJI_MART_SHADOW_FIX_CSS = `
#root.flex.flex-column {
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
#nav {
  flex-shrink: 0;
}
.scroll.flex-grow {
  min-height: 0;
  flex: 1 1 0%;
}
/* Inline height:100% on this wrapper breaks scrollHeight until distant rows mount; grow with content. */
.scroll.flex-grow > div {
  height: auto !important;
  min-height: 100%;
  width: 100%;
  box-sizing: border-box;
}
.category + .category {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--em-color-border);
}
.category .sticky {
  margin-bottom: 6px;
}
.scroll {
  overflow-x: hidden !important;
  overflow-y: scroll !important;
  overscroll-behavior: contain;
  touch-action: pan-y;
  scrollbar-gutter: stable;
  /* Wider track than emoji-mart default so the bar reads as always visible. */
  scrollbar-width: auto;
  scrollbar-color: var(--em-color-border) rgb(var(--em-rgb-background));
}
.scroll::-webkit-scrollbar {
  width: 10px;
}
/* emoji-mart only paints the thumb on .scroll:hover — keep track + thumb visible on first paint. */
.scroll::-webkit-scrollbar-track {
  background-color: rgba(0, 0, 0, 0.07);
  border-radius: 8px;
}
.scroll::-webkit-scrollbar-thumb {
  min-height: 48px;
  border: 3px solid rgb(var(--em-rgb-background));
  border-radius: 8px;
  background-color: var(--em-color-border) !important;
}
.scroll::-webkit-scrollbar-thumb:hover {
  background-color: var(--em-color-border-over) !important;
}
`;

function installEmojiMartShadowLayoutFix(rootEl: HTMLElement): () => void {
  const attr = 'data-card-desc-em-shadow-fix';
  let cancelled = false;
  let rafChain = 0;
  let pollId: number | undefined;
  let observerTimeoutId: number | undefined;
  let observer: MutationObserver | undefined;

  /** Run once when the fix sheet is first inserted; avoids scroll/IO feedback loops with MutationObserver. */
  const nudgeScrollLayoutOnce = (shadow: ShadowRoot): void => {
    const scrollEl = shadow.querySelector('.scroll');
    if (!(scrollEl instanceof HTMLElement)) {
      return;
    }
    void scrollEl.offsetHeight;
    scrollEl.scrollTop = scrollEl.scrollTop;
  };

  const stopWatching = (): void => {
    observer?.disconnect();
    observer = undefined;
    if (pollId !== undefined) {
      window.clearInterval(pollId);
      pollId = undefined;
    }
    if (observerTimeoutId !== undefined) {
      window.clearTimeout(observerTimeoutId);
      observerTimeoutId = undefined;
    }
  };

  const tryInject = (): boolean => {
    if (cancelled) {
      return false;
    }
    const host = rootEl.querySelector('em-emoji-picker');
    const shadow = host?.shadowRoot;
    if (!shadow?.querySelector('#root')) {
      return false;
    }
    if (!shadow.querySelector(`style[${attr}]`)) {
      const style = document.createElement('style');
      style.setAttribute(attr, '1');
      style.textContent = EMOJI_MART_SHADOW_FIX_CSS;
      shadow.appendChild(style);
      nudgeScrollLayoutOnce(shadow);
    }
    return true;
  };

  if (tryInject()) {
    return () => {
      cancelled = true;
    };
  }

  pollId = window.setInterval(() => {
    if (tryInject()) {
      stopWatching();
    }
  }, 48);

  observerTimeoutId = window.setTimeout(() => {
    stopWatching();
  }, 8000);

  observer = new MutationObserver(() => {
    if (tryInject()) {
      stopWatching();
    }
  });
  observer.observe(rootEl, { childList: true, subtree: true });

  const scheduleRafRetries = (): void => {
    const step = (): void => {
      if (cancelled) {
        return;
      }
      if (tryInject()) {
        stopWatching();
        return;
      }
      rafChain += 1;
      if (rafChain < 12) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  };
  scheduleRafRetries();

  return () => {
    cancelled = true;
    stopWatching();
  };
}

const LazyEmojiMartPicker = lazy(async () => {
  const [{ default: EmojiPicker }, { default: emojiData }] = await Promise.all([
    import('@emoji-mart/react'),
    import('@emoji-mart/data/sets/15/twitter.json'),
  ]);

  function EmojiMartPicker({ onEmojiSelect, rgbBackground, rgbColor }: EmojiMartLazyProps) {
    const wrapRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const el = wrapRef.current;
      if (el == null) {
        return;
      }
      const cleanInject = installEmojiMartShadowLayoutFix(el);

      /**
       * Wheel over emoji-mart often targets nodes inside closed shadow DOM. `el.contains(e.target)` is
       * false for those targets, so the browser may not scroll `.scroll` and parents (e.g. modal) eat
       * the delta. Forward wheel explicitly using `composedPath()` so it always hits our wrapper.
       */
      const forwardWheelToEmojiScroll = (e: WheelEvent): void => {
        if (e.ctrlKey) {
          return;
        }
        if (!e.composedPath().includes(el)) {
          return;
        }
        const host = el.querySelector('em-emoji-picker');
        const shadow = host?.shadowRoot;
        const scrollEl = shadow?.querySelector('.scroll');
        if (!(scrollEl instanceof HTMLElement)) {
          return;
        }
        if (scrollEl.scrollHeight <= scrollEl.clientHeight) {
          return;
        }
        const max = scrollEl.scrollHeight - scrollEl.clientHeight;
        scrollEl.scrollTop = Math.max(0, Math.min(max, scrollEl.scrollTop + e.deltaY));
        e.preventDefault();
        e.stopPropagation();
      };

      el.addEventListener('wheel', forwardWheelToEmojiScroll, { passive: false, capture: true });
      return () => {
        cleanInject();
        el.removeEventListener('wheel', forwardWheelToEmojiScroll, { capture: true });
      };
    }, []);

    return (
      <div
        ref={wrapRef}
        className="card-desc-emoji-mart-root"
        style={
          {
            '--rgb-background': rgbBackground,
            '--rgb-color': rgbColor,
            '--rgb-input': CARD_DETAIL_EMOJI_MART_INPUT_FOCUS_RGB,
          } as CSSProperties
        }
      >
        <EmojiPicker
          data={emojiData}
          onEmojiSelect={onEmojiSelect}
          theme="light"
          locale="en"
          previewPosition="none"
          skinTonePosition="search"
          searchPosition="sticky"
          navPosition="bottom"
          perLine={9}
          maxFrequentRows={2}
          set="twitter"
          dynamicWidth
          getSpritesheetURL={() => EMOJI_DATASOURCE_TWITTER_SPRITESHEET_64_PUBLIC_PATH}
        />
      </div>
    );
  }

  return { default: EmojiMartPicker };
});

function prefetchEmojiMartModules(): void {
  void Promise.all([
    import('@emoji-mart/react'),
    import('@emoji-mart/data/sets/15/twitter.json'),
  ]);
}

interface CardDescriptionEditorToolbarProps {
  readonly editor: Editor;
  readonly cardId: string;
}

interface ToolbarUiState {
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

const CardDescriptionEditorToolbar = memo(function CardDescriptionEditorToolbar({
  editor,
  cardId,
}: CardDescriptionEditorToolbarProps) {
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false);
  const [emojiPopoverOpen, setEmojiPopoverOpen] = useState(false);
  const [textColorPickerValue, setTextColorPickerValue] = useState(
    EDITOR_TEXT_COLOR_FALLBACK,
  );
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [videoUploadBusy, setVideoUploadBusy] = useState(false);

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
      const textColor =
        typeof textStyleAttrs.color === 'string' ? textStyleAttrs.color.trim() : '';
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

  const isMediaUploadBusy = imageUploadBusy || videoUploadBusy;

  const uploadAttachmentAndGetUrl = async (file: File): Promise<string | null> => {
    try {
      const response = await api.uploadCardAttachment(cardId, file);
      const attachmentId = (response as { attachment?: { id?: unknown } }).attachment?.id;
      if (typeof attachmentId !== 'string' || attachmentId.trim() === '') {
        throw new Error('Upload succeeded but attachment id was missing.');
      }
      return api.getAttachmentFileUrl(attachmentId);
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Upload failed',
        message: error instanceof Error ? error.message : 'Could not upload file.',
      });
      return null;
    }
  };

  const handleInsertImage = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file == null) {
        return;
      }
      setImageUploadBusy(true);
      const src = await uploadAttachmentAndGetUrl(file);
      if (typeof src === 'string' && src.trim() !== '') {
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'imageResize',
            attrs: { src, alt: file.name },
          })
          .run();
      }
      setImageUploadBusy(false);
    };
    input.click();
  };

  const handleInsertVideo = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file == null) {
        return;
      }
      setVideoUploadBusy(true);
      const src = await uploadAttachmentAndGetUrl(file);
      if (typeof src === 'string' && src.trim() !== '') {
        editor.chain().focus().setVideo({ src }).run();
      }
      setVideoUploadBusy(false);
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
    <Group
      className="card-desc-tiptap-toolbar"
      gap={4}
      p="xs"
      wrap="wrap"
      style={{ borderBottom: '1px solid var(--mantine-color-gray-3)', position: 'relative' }}
    >
      <Box
        aria-hidden
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: -1,
        }}
      >
        <span
          ref={emojiRgbProbeBgRef}
          style={{ display: 'block', backgroundColor: 'var(--board-card-detail-bg, #f8f9fb)' }}
        />
        <span
          ref={emojiRgbProbeFgRef}
          style={{ display: 'block', color: 'var(--board-card-detail-text, #868e96)' }}
        >
          &nbsp;
        </span>
      </Box>
      <Tooltip label="Bold">
        <ActionIcon
          size={TOOLBAR_BUTTON_SIZE}
          color="gray"
          variant={ui.activeBold ? 'filled' : 'subtle'}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Toggle bold"
        >
          <IconBold size={TOOLBAR_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Italic">
        <ActionIcon
          size={TOOLBAR_BUTTON_SIZE}
          color="gray"
          variant={ui.activeItalic ? 'filled' : 'subtle'}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Toggle italic"
        >
          <IconItalic size={TOOLBAR_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Strikethrough">
        <ActionIcon
          size={TOOLBAR_BUTTON_SIZE}
          color="gray"
          variant={ui.activeStrike ? 'filled' : 'subtle'}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          aria-label="Toggle strikethrough"
        >
          <IconStrikethrough size={TOOLBAR_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Underline">
        <ActionIcon
          size={TOOLBAR_BUTTON_SIZE}
          color="gray"
          variant={ui.activeUnderline ? 'filled' : 'subtle'}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          aria-label="Toggle underline"
        >
          <IconUnderline size={TOOLBAR_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>
      <Menu shadow="md" width={160} closeOnItemClick>
        <Menu.Target>
          <Tooltip label="Text size (px)">
            <ActionIcon
              size={TOOLBAR_BUTTON_SIZE}
              color="gray"
              variant={ui.hasCustomFontSize ? 'filled' : 'subtle'}
              aria-label="Text size"
            >
              <IconTextSize size={TOOLBAR_ICON_SIZE} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            onClick={() => editor.chain().focus().unsetFontSize().run()}
            disabled={!ui.hasCustomFontSize}
          >
            Default size
          </Menu.Item>
          {FONT_SIZE_PX_PRESETS.map((px) => {
            const value = `${px}px`;
            const active = ui.fontSizeRaw === value;
            return (
              <Menu.Item
                key={px}
                onClick={() => editor.chain().focus().setFontSize(value).run()}
                style={active ? { backgroundColor: 'var(--mantine-color-gray-2)' } : undefined}
              >
                {value}
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>
      <Popover
        opened={colorPopoverOpen}
        onChange={handleColorPopoverChange}
        position="bottom-start"
        width={300}
        zIndex={520}
      >
        <Popover.Target>
          <Tooltip label="Text color">
            <ActionIcon
              size={TOOLBAR_BUTTON_SIZE}
              color="gray"
              variant={ui.hasTextColor ? 'filled' : 'subtle'}
              onClick={() => handleColorPopoverChange(!colorPopoverOpen)}
              aria-label="Text color"
            >
              <IconPalette size={TOOLBAR_ICON_SIZE} />
            </ActionIcon>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <BoardColourPickerPanel
              density="compact"
              value={textColorPickerValue}
              onChange={(hex) => {
                setTextColorPickerValue(hex);
                editor.chain().focus().setColor(hex).run();
              }}
            />
            <Button
              size="xs"
              color="gray"
              variant="default"
              onClick={() => {
                editor.chain().focus().unsetColor().run();
                setTextColorPickerValue(EDITOR_TEXT_COLOR_FALLBACK);
                setColorPopoverOpen(false);
              }}
            >
              Remove color
            </Button>
          </Stack>
        </Popover.Dropdown>
      </Popover>
      <Popover
        opened={emojiPopoverOpen}
        onChange={handleEmojiPopoverChange}
        position="bottom-start"
        width={360}
        zIndex={520}
        middlewares={{ flip: true, shift: { padding: 8 } }}
      >
        <Popover.Target>
          <Tooltip label="Insert emoji (Twemoji)">
            <ActionIcon
              size={TOOLBAR_BUTTON_SIZE}
              color="gray"
              variant="subtle"
              onClick={() => handleEmojiPopoverChange(!emojiPopoverOpen)}
              aria-label="Insert emoji"
            >
              <IconMoodSmile size={TOOLBAR_ICON_SIZE} />
            </ActionIcon>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown
          p={4}
          styles={{
            dropdown: {
              maxHeight: 'min(452px, calc(100dvh - 32px))',
              overflow: 'visible',
              backgroundColor: CARD_DETAIL_MODAL_BACKGROUND_HEX,
            },
          }}
        >
          <Suspense fallback={<div style={{ padding: 12, fontSize: 13 }}>Loading emoji picker...</div>}>
            <LazyEmojiMartPicker
              onEmojiSelect={handleEmojiPick}
              rgbBackground={emojiMartRgbBackground}
              rgbColor={emojiMartRgbColor}
            />
          </Suspense>
        </Popover.Dropdown>
      </Popover>
      <Divider orientation="vertical" />
      <Menu shadow="md" width={200} closeOnItemClick>
        <Menu.Target>
          <Tooltip label="Paragraph / headings">
            <ActionIcon
              size={TOOLBAR_BUTTON_SIZE}
              color="gray"
              variant={ui.activeHeading ? 'filled' : 'subtle'}
              aria-label="Open heading menu"
            >
              <IconHeading size={TOOLBAR_ICON_SIZE} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            onClick={() => editor.chain().focus().setParagraph().run()}
            disabled={ui.activeParagraph}
          >
            Paragraph
          </Menu.Item>
          {([1, 2, 3, 4, 5, 6] as const).map((level) => (
            <Menu.Item
              key={level}
              onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
            >
              Heading {level}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      <Menu shadow="md" width={180} closeOnItemClick>
        <Menu.Target>
          <Tooltip label="Text alignment">
            <ActionIcon
              size={TOOLBAR_BUTTON_SIZE}
              color="gray"
              variant={
                ui.alignCenter || ui.alignRight || ui.alignJustify ? 'filled' : 'subtle'
              }
              aria-label="Text alignment"
            >
              {ui.alignCenter ? (
                <IconAlignCenter size={TOOLBAR_ICON_SIZE} />
              ) : ui.alignRight ? (
                <IconAlignRight size={TOOLBAR_ICON_SIZE} />
              ) : ui.alignJustify ? (
                <IconAlignJustified size={TOOLBAR_ICON_SIZE} />
              ) : (
                <IconAlignLeft size={TOOLBAR_ICON_SIZE} />
              )}
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconAlignLeft size={14} />}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
          >
            Align left
          </Menu.Item>
          <Menu.Item
            leftSection={<IconAlignCenter size={14} />}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
          >
            Align center
          </Menu.Item>
          <Menu.Item
            leftSection={<IconAlignRight size={14} />}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
          >
            Align right
          </Menu.Item>
          <Menu.Item
            leftSection={<IconAlignJustified size={14} />}
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          >
            Justify
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Menu shadow="md" width={200} closeOnItemClick>
        <Menu.Target>
          <Tooltip label="Line height">
            <ActionIcon
              size={TOOLBAR_BUTTON_SIZE}
              color="gray"
              variant={ui.hasCustomLineHeight ? 'filled' : 'subtle'}
              aria-label="Line height"
            >
              <IconArrowAutofitHeight size={TOOLBAR_ICON_SIZE} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            onClick={() => applyBlockLineHeight(editor, null)}
            disabled={!ui.hasCustomLineHeight}
          >
            Default (1.2)
          </Menu.Item>
          {LINE_HEIGHT_PRESETS.map((h) => {
            const active = ui.lineHeightRaw === h;
            return (
              <Menu.Item
                key={h}
                onClick={() => applyBlockLineHeight(editor, h)}
                style={active ? { backgroundColor: 'var(--mantine-color-gray-2)' } : undefined}
              >
                {h}
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>
      <Tooltip label="Bullet list">
        <ActionIcon
          size={TOOLBAR_BUTTON_SIZE}
          color="gray"
          variant={ui.activeBulletList ? 'filled' : 'subtle'}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Toggle bullet list"
        >
          <IconList size={TOOLBAR_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Numbered list">
        <ActionIcon
          size={TOOLBAR_BUTTON_SIZE}
          color="gray"
          variant={ui.activeOrderedList ? 'filled' : 'subtle'}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Toggle numbered list"
        >
          <IconListNumbers size={TOOLBAR_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Quote">
        <ActionIcon
          size={TOOLBAR_BUTTON_SIZE}
          color="gray"
          variant={ui.activeBlockquote ? 'filled' : 'subtle'}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          aria-label="Toggle quote"
        >
          <IconBlockquote size={TOOLBAR_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Horizontal rule">
        <ActionIcon
          size={TOOLBAR_BUTTON_SIZE}
          color="gray"
          variant="subtle"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          aria-label="Insert horizontal rule"
        >
          <IconSeparator size={TOOLBAR_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Code block">
        <ActionIcon
          size={TOOLBAR_BUTTON_SIZE}
          color="gray"
          variant={ui.activeCodeBlock ? 'filled' : 'subtle'}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          aria-label="Toggle code block"
        >
          <IconCode size={TOOLBAR_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Insert image">
        <ActionIcon
          size={TOOLBAR_BUTTON_SIZE}
          color="gray"
          variant="subtle"
          onClick={handleInsertImage}
          aria-label="Insert image"
          disabled={isMediaUploadBusy}
        >
          <IconPhoto size={TOOLBAR_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Insert video">
        <ActionIcon
          size={TOOLBAR_BUTTON_SIZE}
          color="gray"
          variant="subtle"
          onClick={handleInsertVideo}
          aria-label="Insert video"
          disabled={isMediaUploadBusy}
        >
          <IconVideo size={TOOLBAR_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Insert Inline Button (Double-click inserted button to configure)">
        <ActionIcon
          size={TOOLBAR_BUTTON_SIZE}
          color="gray"
          variant="subtle"
          onClick={() => editor.chain().focus().insertInlineButton().run()}
          aria-label="Insert Inline Button (Double-click inserted button to configure)"
        >
          <IconRowInsertTop size={TOOLBAR_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>
      <Divider orientation="vertical" />
      <Tooltip label="Undo">
        <ActionIcon
          size={TOOLBAR_BUTTON_SIZE}
          color="gray"
          variant="subtle"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!ui.canUndo}
          aria-label="Undo"
        >
          <IconArrowBackUp size={TOOLBAR_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Redo">
        <ActionIcon
          size={TOOLBAR_BUTTON_SIZE}
          color="gray"
          variant="subtle"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!ui.canRedo}
          aria-label="Redo"
        >
          <IconArrowForwardUp size={TOOLBAR_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
});

/**
 * Updates only DOM (no React state) so typing does not re-render the card detail shell or this editor tree.
 */
function DescriptionCharLimitHint({
  editor,
  maxChars,
}: {
  readonly editor: Editor;
  readonly maxChars: number;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId = 0;
    const flush = (): void => {
      const row = rowRef.current;
      if (row == null) {
        return;
      }
      const n = getCardDescriptionTextLength(editor.getJSON());
      const remaining = maxChars - n;
      if (remaining <= 5) {
        row.style.display = 'block';
        row.textContent = `${n}/${maxChars} characters`;
      } else {
        row.style.display = 'none';
        row.textContent = '';
      }
    };
    const schedule = (): void => {
      if (rafId !== 0) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        flush();
      });
    };
    flush();
    editor.on('update', schedule);
    return () => {
      editor.off('update', schedule);
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [editor, maxChars]);

  return (
    <div
      ref={rowRef}
      role="status"
      aria-live="polite"
      style={{
        display: 'none',
        fontSize: 'var(--mantine-font-size-xs)',
        color: 'var(--mantine-color-dimmed)',
        padding: '4px var(--mantine-spacing-xs)',
        backgroundColor: 'var(--mantine-color-gray-1)',
      }}
    />
  );
}

export interface CardDescriptionEditorProps {
  cardId: string;
  /** Serialized JSON — used as initial document when this component mounts. */
  valueJson: string | undefined | null;
  placeholder?: string;
  minHeightPx?: number;
  onEditorReady?: (editor: Editor | null) => void;
  onJsonByteLengthChange?: (length: number) => void;
  onTextLengthChange?: (length: number) => void;
}

export function CardDescriptionEditor({
  cardId,
  valueJson,
  placeholder = 'Write something…',
  minHeightPx = 240,
  onEditorReady,
  onJsonByteLengthChange,
  onTextLengthChange,
}: CardDescriptionEditorProps) {
  const [inlineButtonEditPos, setInlineButtonEditPos] = useState<number | null>(null);
  const closeInlineButtonModal = useCallback(() => {
    setInlineButtonEditPos(null);
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
      <CardDescriptionEditorToolbar editor={editor} cardId={cardId} />
      <EditorContent editor={editor} />
      <CardDescriptionInlineButtonEditModal
        key={inlineButtonEditPos ?? 'inline-button-closed'}
        opened={inlineButtonEditPos !== null}
        nodePos={inlineButtonEditPos}
        onClose={closeInlineButtonModal}
        editor={editor}
        cardId={cardId}
      />
      <DescriptionCharLimitHint editor={editor} maxChars={CARD_DESCRIPTION_TEXT_MAX_LENGTH} />
    </div>
  );
}

export { serializeCardDescriptionEditor } from './cardDescriptionEditorSerialize.js';
