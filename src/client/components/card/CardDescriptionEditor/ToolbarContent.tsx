import { useMemo, type CSSProperties, type MutableRefObject } from 'react';
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
  IconHeading,
  IconItalic,
  IconList,
  IconListNumbers,
  IconPalette,
  IconPhoto,
  IconRowInsertTop,
  IconSeparator,
  IconStrikethrough,
  IconTextSize,
  IconUnderline,
  IconVideo,
} from '@tabler/icons-react';
import { BoardColourPickerPanel } from '../../board/BoardColourPickerPanel.js';
import { CardDescriptionEmojiPicker } from './CardDescriptionEmojiPicker.js';
import {
  applyBlockLineHeight,
  FONT_SIZE_PX_PRESETS,
  LINE_HEIGHT_PRESETS,
  TOOLBAR_BUTTON_SIZE,
  TOOLBAR_ICON_SIZE,
} from './toolbarConfig.js';
import type { ToolbarUiState } from './Toolbar.tsx';

interface ToolbarContentProps {
  readonly editor: Editor;
  readonly ui: ToolbarUiState;
  readonly isMobile: boolean;
  readonly isKeyboardDocked: boolean;
  readonly keyboardDockBottom: number;
  readonly colorPopoverOpen: boolean;
  readonly emojiPopoverOpen: boolean;
  readonly textColorPickerValue: string;
  readonly isMediaUploadBusy: boolean;
  readonly emojiMartRgbBackground: string;
  readonly emojiMartRgbColor: string;
  readonly emojiRgbProbeBgRef: MutableRefObject<HTMLSpanElement | null>;
  readonly emojiRgbProbeFgRef: MutableRefObject<HTMLSpanElement | null>;
  readonly onColorPopoverChange: (open: boolean) => void;
  readonly onEmojiPopoverChange: (open: boolean) => void;
  readonly onTextColorChange: (hex: string) => void;
  readonly onClearTextColor: () => void;
  readonly onEmojiPick: (payload: unknown) => void;
  readonly onInsertImage: () => void;
  readonly onInsertVideo: () => void;
}

export function ToolbarContent({
  editor,
  ui,
  isMobile,
  isKeyboardDocked,
  keyboardDockBottom,
  colorPopoverOpen,
  emojiPopoverOpen,
  textColorPickerValue,
  isMediaUploadBusy,
  emojiMartRgbBackground,
  emojiMartRgbColor,
  emojiRgbProbeBgRef,
  emojiRgbProbeFgRef,
  onColorPopoverChange,
  onEmojiPopoverChange,
  onTextColorChange,
  onClearTextColor,
  onEmojiPick,
  onInsertImage,
  onInsertVideo,
}: ToolbarContentProps) {
  const toolbarStyle = useMemo((): CSSProperties => {
    if (!isKeyboardDocked) {
      return { borderBottom: '1px solid var(--mantine-color-gray-3)' };
    }
    return {
      borderTop: '1px solid var(--mantine-color-gray-3)',
      bottom: keyboardDockBottom,
    };
  }, [isKeyboardDocked, keyboardDockBottom]);

  const toolbarClassName = isKeyboardDocked
    ? 'card-desc-tiptap-toolbar card-desc-tiptap-toolbar--keyboard-docked'
    : 'card-desc-tiptap-toolbar';

  return (
    <Group
      className={toolbarClassName}
      gap={4}
      p="xs"
      wrap="wrap"
      style={toolbarStyle}
    >
      {/* Own positioning context so the toolbar row can use `position: sticky` on mobile without `position: relative` defeating it. */}
      <Box aria-hidden pos="relative" w={0} h={0} flex="0 0 0" style={{ overflow: 'hidden' }}>
        <Box
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
        onChange={onColorPopoverChange}
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
              onClick={() => onColorPopoverChange(!colorPopoverOpen)}
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
              onChange={onTextColorChange}
            />
            <Button size="xs" color="gray" variant="default" onClick={onClearTextColor}>
              Remove color
            </Button>
          </Stack>
        </Popover.Dropdown>
      </Popover>
      <CardDescriptionEmojiPicker
        isMobile={isMobile}
        opened={emojiPopoverOpen}
        onOpenChange={onEmojiPopoverChange}
        onEmojiPick={onEmojiPick}
        rgbBackground={emojiMartRgbBackground}
        rgbColor={emojiMartRgbColor}
      />
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
            <Menu.Item key={level} onClick={() => editor.chain().focus().toggleHeading({ level }).run()}>
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
              variant={ui.alignCenter || ui.alignRight || ui.alignJustify ? 'filled' : 'subtle'}
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
          {LINE_HEIGHT_PRESETS.map((height) => {
            const active = ui.lineHeightRaw === height;
            return (
              <Menu.Item
                key={height}
                onClick={() => applyBlockLineHeight(editor, height)}
                style={active ? { backgroundColor: 'var(--mantine-color-gray-2)' } : undefined}
              >
                {height}
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
          onClick={onInsertImage}
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
          onClick={onInsertVideo}
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
}
