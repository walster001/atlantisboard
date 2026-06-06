import { memo, type CSSProperties } from 'react';
import { Box, Button, Group, Stack, Text } from '@mantine/core';
import { IconArrowLeft, IconLayoutKanbanFilled, IconSettings } from '@tabler/icons-react';
import type { BoardThemePalette } from '../../../shared/boardTheme.js';

const CARD_DETAIL_PREVIEW_LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.';

const PREVIEW_BOARD_TITLE = 'Sample Board';
const PREVIEW_USER_NAME = 'Alex Doe';

/** Large live preview; isolated so typing in the form does not re-render every keystroke through this tree. */
export interface BoardThemeEditorModalPreviewProps {
  readonly previewPalette: Readonly<BoardThemePalette>;
  readonly navFg: string;
  readonly cardDetailTitle: string;
  readonly cardDetailProse: string;
  readonly scrollbarThumb: string;
  readonly scrollbarTrack: string;
}

function BoardThemeEditorModalPreviewInner({
  previewPalette,
  navFg,
  cardDetailTitle,
  cardDetailProse,
  scrollbarThumb,
  scrollbarTrack,
}: BoardThemeEditorModalPreviewProps) {
  return (
    <Stack gap="md" className="board-theme-editor-modal__preview-column">
      <Text className="board-theme-editor-modal__section-title">PREVIEW</Text>
      <Text fw={600} size="sm" c="dimmed">
        Board View
      </Text>
      <Box className="board-theme-editor-modal__board-preview" style={{ backgroundColor: previewPalette.canvasBg }}>
        <Box className="board-theme-editor-modal__board-preview-nav" style={{ backgroundColor: previewPalette.navbarBg }}>
          <Group justify="space-between" align="center" wrap="nowrap" gap="xs" px={6} w="100%">
            <Group gap={6} wrap="nowrap" align="center" style={{ flex: 1, minWidth: 0 }}>
              <IconArrowLeft
                size={18}
                stroke={1.75}
                aria-hidden
                style={{ color: previewPalette.navbarBorder, flexShrink: 0 }}
              />
              <IconLayoutKanbanFilled
                size={18}
                aria-hidden
                style={{ color: previewPalette.navbarBorder, flexShrink: 0 }}
              />
              <Text fw={700} size="xs" tt="uppercase" lineClamp={1} style={{ color: navFg, letterSpacing: '0.04em' }}>
                {PREVIEW_BOARD_TITLE}
              </Text>
            </Group>
            <Group gap={6} wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
              <IconSettings size={18} stroke={1.9} aria-hidden style={{ color: previewPalette.navbarBorder }} />
              <Group gap={6} wrap="nowrap" align="center">
                <Box
                  className="board-theme-editor-modal__board-preview-avatar"
                  style={{
                    backgroundColor: previewPalette.navbarBorder,
                    color: previewPalette.navbarBg,
                  }}
                >
                  <Text size="xs" fw={700} lh={1}>
                    A
                  </Text>
                </Box>
                <Text size="xs" fw={500} lineClamp={1} style={{ color: previewPalette.navbarBorder, maxWidth: 72 }}>
                  {PREVIEW_USER_NAME}
                </Text>
              </Group>
            </Group>
          </Group>
        </Box>
        <Box
          className="board-theme-editor-modal__board-preview-body"
          style={
            {
              scrollbarColor: `${scrollbarThumb} ${scrollbarTrack}`,
              '--board-preview-scrollbar-thumb': scrollbarThumb,
              '--board-preview-scrollbar-track': scrollbarTrack,
            } as CSSProperties
          }
        >
          <Group
            gap="xs"
            wrap="nowrap"
            className="board-theme-editor-modal__board-preview-columns"
            style={{ width: 'max-content', minWidth: 520 }}
            align="flex-start"
          >
            <Box
              className="board-theme-editor-modal__board-preview-list"
              style={{
                backgroundColor: previewPalette.listBg,
                color: previewPalette.listHeaderText,
                boxShadow: previewPalette.listShadow,
              }}
            >
              <Group justify="space-between" align="center" wrap="nowrap" gap={6} mb={6}>
                <Text fw={700} size="xs" style={{ color: previewPalette.listHeaderText }}>
                  In Progress
                </Text>
                <Text size="xs" style={{ color: previewPalette.listMuted }}>
                  3
                </Text>
              </Group>
              <Box
                className="board-theme-editor-modal__list-preview-scroll"
                style={
                  {
                    scrollbarColor: `${scrollbarThumb} ${scrollbarTrack}`,
                    '--board-preview-scrollbar-thumb': scrollbarThumb,
                    '--board-preview-scrollbar-track': scrollbarTrack,
                  } as CSSProperties
                }
              >
                {Array.from({ length: 6 }, (_, i) => (
                  <Box
                    key={i}
                    className="board-theme-editor-modal__board-preview-card"
                    style={{
                      background: previewPalette.listControlHoverBg,
                    }}
                  />
                ))}
              </Box>
              <Text size="xs" mt={8} style={{ color: previewPalette.listMutedStrong }}>
                Add a card
              </Text>
            </Box>
            <Box
              className="board-theme-editor-modal__board-preview-list"
              style={{
                backgroundColor: previewPalette.listBg,
                color: previewPalette.listHeaderText,
                boxShadow: previewPalette.listShadow,
              }}
            >
              <Group justify="space-between" align="center" wrap="nowrap" gap={6} mb={6}>
                <Text fw={700} size="xs" style={{ color: previewPalette.listHeaderText }}>
                  Done
                </Text>
                <Text size="xs" style={{ color: previewPalette.listMuted }}>
                  0
                </Text>
              </Group>
              <Box
                className="board-theme-editor-modal__board-preview-card"
                style={{
                  background: previewPalette.listControlHoverBg,
                }}
              />
            </Box>
            <Stack gap={6} align="center" className="board-theme-editor-modal__board-preview-add-list">
              <Text size="xs" fw={700} style={{ color: previewPalette.listHeaderText }}>
                Add list
              </Text>
              <Box
                px={8}
                py={5}
                style={{
                  backgroundColor: previewPalette.addListBg,
                  borderRadius: 8,
                  width: '100%',
                }}
              >
                <Text size="xs" ta="center" style={{ color: previewPalette.listHeaderText }}>
                  Idle
                </Text>
              </Box>
              <Box
                px={8}
                py={5}
                style={{
                  backgroundColor: previewPalette.addListBgHover,
                  borderRadius: 8,
                  width: '100%',
                }}
              >
                <Text size="xs" ta="center" style={{ color: previewPalette.listHeaderText }}>
                  Hover
                </Text>
              </Box>
            </Stack>
          </Group>
        </Box>
      </Box>

      <Text fw={600} size="sm" c="dimmed">
        Card Detail Window
      </Text>
      <Box className="board-theme-editor-modal__card-preview" style={{ backgroundColor: previewPalette.cardDetailBg }}>
        <Group justify="space-between" mb="xs" wrap="nowrap" gap="xs" align="flex-start">
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text size="xs" fw={700} tt="uppercase" style={{ color: previewPalette.cardDetailText, letterSpacing: '0.06em' }}>
              Description
            </Text>
            <Text fw={700} size="sm" lineClamp={2} style={{ color: cardDetailTitle }}>
              Example card title
            </Text>
          </Stack>
          <Box
            className="board-theme-editor-modal__card-preview-close"
            style={{
              backgroundColor: previewPalette.cardDetailButtonBg,
              color: previewPalette.cardDetailButtonText,
            }}
          >
            ×
          </Box>
        </Group>
        <Text size="sm" lh={1.45} style={{ color: cardDetailProse }}>
          {CARD_DETAIL_PREVIEW_LOREM}
        </Text>
        <Group gap="xs" mt="md">
          <Button
            size="xs"
            variant="filled"
            styles={{
              root: {
                backgroundColor: previewPalette.cardDetailButtonBg,
                color: previewPalette.cardDetailButtonText,
              },
            }}
          >
            Action
          </Button>
          <Button
            size="xs"
            variant="filled"
            styles={{
              root: {
                backgroundColor: previewPalette.cardDetailButtonHoverBg,
                color: previewPalette.cardDetailButtonHoverText,
              },
            }}
          >
            Hover
          </Button>
        </Group>
      </Box>
    </Stack>
  );
}

export const BoardThemeEditorModalPreview = memo(BoardThemeEditorModalPreviewInner);
