import { Suspense, useCallback, useEffect } from 'react';
import { ActionIcon, Box, Modal, Popover, Tooltip } from '@mantine/core';
import { IconMoodSmile, IconX } from '@tabler/icons-react';
import {
  emojiPickerPopoverDropdownStyles,
  LazyEmojiMartPicker,
} from './emojiMartPicker.js';
import { useEmojiPickerScrollShard } from './emojiPickerScrollShardContext.js';
import { TOOLBAR_BUTTON_SIZE, TOOLBAR_ICON_SIZE } from './toolbarConfig.js';

interface CardDescriptionEmojiPickerProps {
  readonly isMobile: boolean;
  readonly opened: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onEmojiPick: (payload: unknown) => void;
  readonly rgbBackground: string;
  readonly rgbColor: string;
}

export function CardDescriptionEmojiPicker({
  isMobile,
  opened,
  onOpenChange,
  onEmojiPick,
  rgbBackground,
  rgbColor,
}: CardDescriptionEmojiPickerProps) {
  const scrollShardCtx = useEmojiPickerScrollShard();

  useEffect(() => {
    if (!opened) {
      scrollShardCtx?.setScrollShards([]);
    }
  }, [opened, scrollShardCtx]);

  const handleScrollTargetsChange = useCallback(
    (targets: readonly HTMLElement[]) => {
      scrollShardCtx?.setScrollShards(targets);
    },
    [scrollShardCtx],
  );

  const toggle = (): void => {
    onOpenChange(!opened);
  };

  if (isMobile) {
    return (
      <>
        <Tooltip label="Insert emoji">
          <ActionIcon
            size={TOOLBAR_BUTTON_SIZE}
            color="gray"
            variant={opened ? 'filled' : 'subtle'}
            onClick={toggle}
            aria-label="Insert emoji"
            aria-expanded={opened}
          >
            <IconMoodSmile size={TOOLBAR_ICON_SIZE} />
          </ActionIcon>
        </Tooltip>
        <Modal
          opened={opened}
          onClose={() => onOpenChange(false)}
          fullScreen
          withCloseButton={false}
          padding={0}
          zIndex={600}
          lockScroll={false}
          classNames={{
            content: 'card-desc-emoji-mart-modal',
            body: 'card-desc-emoji-mart-modal__mantine-body',
          }}
          transitionProps={{ duration: 0 }}
        >
          <Box className="card-desc-emoji-mart-modal__header">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              onClick={() => onOpenChange(false)}
              aria-label="Close emoji picker"
            >
              <IconX size={22} stroke={1.75} />
            </ActionIcon>
          </Box>
          <Box className="card-desc-emoji-mart-modal__body">
            <Suspense fallback={<div style={{ padding: 12, fontSize: 13 }}>Loading emoji picker...</div>}>
              <LazyEmojiMartPicker
                onEmojiSelect={onEmojiPick}
                rgbBackground={rgbBackground}
                rgbColor={rgbColor}
                layout="fullscreen"
                onScrollTargetsChange={handleScrollTargetsChange}
              />
            </Suspense>
          </Box>
        </Modal>
      </>
    );
  }

  return (
    <Popover
      opened={opened}
      onChange={onOpenChange}
      position="bottom-start"
      width={360}
      zIndex={520}
      middlewares={{ flip: true, shift: { padding: 8 } }}
    >
      <Popover.Target>
        <Tooltip label="Insert emoji">
          <ActionIcon
            size={TOOLBAR_BUTTON_SIZE}
            color="gray"
            variant="subtle"
            onClick={toggle}
            aria-label="Insert emoji"
          >
            <IconMoodSmile size={TOOLBAR_ICON_SIZE} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p={4} styles={emojiPickerPopoverDropdownStyles}>
        <Suspense fallback={<div style={{ padding: 12, fontSize: 13 }}>Loading emoji picker...</div>}>
          <LazyEmojiMartPicker
            onEmojiSelect={onEmojiPick}
            rgbBackground={rgbBackground}
            rgbColor={rgbColor}
          />
        </Suspense>
      </Popover.Dropdown>
    </Popover>
  );
}
