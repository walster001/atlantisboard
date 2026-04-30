import type { ChangeEvent, Dispatch, SetStateAction } from 'react';
import { Box, Button, ColorInput, Group, Stack, Text } from '@mantine/core';
import type { BoardThemeSettings } from '../../../shared/boardTheme.js';

export interface BoardThemeBackgroundPanelProps {
  canChangeTheme: boolean;
  draft: BoardThemeSettings;
  setDraft: Dispatch<SetStateAction<BoardThemeSettings>>;
  saving: boolean;
  uploadingImage: boolean;
  previewBackground: string | undefined;
  previewIsImage: boolean;
  hasBackgroundImage: boolean;
  onBackgroundModeChange: (mode: string | null) => void;
  onBackgroundImageFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onDeleteBackgroundImage: () => void;
}

export function BoardThemeBackgroundPanel({
  canChangeTheme,
  draft,
  setDraft,
  saving,
  uploadingImage,
  previewBackground,
  previewIsImage,
  hasBackgroundImage,
  onBackgroundModeChange,
  onBackgroundImageFile,
  onDeleteBackgroundImage,
}: BoardThemeBackgroundPanelProps) {
  return (
    <Stack gap="md">
      <Box>
        <Text fw={700} size="xl">
          Board Background
        </Text>
        <Text c="dimmed">Customize the background of your board. Choose a color or upload an image.</Text>
      </Box>

      <Group>
        <Button
          variant={draft.backgroundMode === 'color' ? 'filled' : 'default'}
          onClick={() => onBackgroundModeChange('color')}
          disabled={!canChangeTheme}
        >
          Color
        </Button>
        <Button
          variant={draft.backgroundMode === 'image' ? 'filled' : 'default'}
          onClick={() => onBackgroundModeChange('image')}
          disabled={!canChangeTheme}
        >
          Image
        </Button>
      </Group>

      {draft.backgroundMode === 'color' ? (
        <Stack gap="xs" align="flex-start">
          <ColorInput
            label="Custom Color"
            value={draft.backgroundColor ?? draft.selectedTheme.palette.canvasBg}
            onChange={(value) =>
              setDraft((prev) => {
                if (!canChangeTheme) {
                  return prev;
                }
                return {
                  ...prev,
                  backgroundColor: value,
                };
              })
            }
            withPicker
            styles={{
              root: { width: 'fit-content', maxWidth: '100%' },
              input: { minWidth: '11.5rem' },
            }}
          />
          <Button
            variant="filled"
            size="sm"
            style={{ width: 'fit-content', maxWidth: '100%' }}
            onClick={() =>
              setDraft((prev) => {
                if (!canChangeTheme) {
                  return prev;
                }
                return {
                  ...prev,
                  backgroundMode: 'color',
                };
              })
            }
            disabled={!canChangeTheme}
          >
            Apply Colour
          </Button>
        </Stack>
      ) : null}

      {draft.backgroundMode === 'image' ? (
        <Stack gap="xs">
          {hasBackgroundImage ? (
            <Group gap="xs" wrap="nowrap" style={{ alignSelf: 'flex-start' }}>
              <Button
                component="label"
                variant="outline"
                size="sm"
                loading={uploadingImage}
                disabled={saving || !canChangeTheme}
              >
                Replace Background
                <input
                  hidden
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={onBackgroundImageFile}
                />
              </Button>
              <Button
                variant="outline"
                color="red"
                size="sm"
                disabled={saving || uploadingImage || !canChangeTheme}
                onClick={onDeleteBackgroundImage}
              >
                Delete Image
              </Button>
            </Group>
          ) : (
            <Button
              component="label"
              variant="outline"
              size="sm"
              loading={uploadingImage}
              disabled={saving || !canChangeTheme}
              style={{ alignSelf: 'flex-start' }}
            >
              Upload Image
              <input
                hidden
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={onBackgroundImageFile}
              />
            </Button>
          )}
          <Text size="xs" c="dimmed">
            Supported: JPG, PNG, GIF, WebP
          </Text>
          <Group gap="xs">
            <Text size="sm" fw={600}>
              Scaling
            </Text>
            <Button
              size="xs"
              variant={(draft.backgroundImageScale ?? 'fill') === 'fit-top-left' ? 'filled' : 'default'}
              onClick={() =>
                setDraft((prev) => {
                  if (!canChangeTheme) {
                    return prev;
                  }
                  return {
                    ...prev,
                    backgroundImageScale: 'fit-top-left',
                  };
                })
              }
              disabled={!canChangeTheme}
            >
              Top-left Fill
            </Button>
            <Button
              size="xs"
              variant={(draft.backgroundImageScale ?? 'fill') === 'fill' ? 'filled' : 'default'}
              onClick={() =>
                setDraft((prev) => {
                  if (!canChangeTheme) {
                    return prev;
                  }
                  return {
                    ...prev,
                    backgroundImageScale: 'fill',
                  };
                })
              }
              disabled={!canChangeTheme}
            >
              Center Fill
            </Button>
            <Button
              size="xs"
              variant={(draft.backgroundImageScale ?? 'fill') === 'smart-fill' ? 'filled' : 'default'}
              onClick={() =>
                setDraft((prev) => {
                  if (!canChangeTheme) {
                    return prev;
                  }
                  return {
                    ...prev,
                    backgroundImageScale: 'smart-fill',
                  };
                })
              }
              disabled={!canChangeTheme}
            >
              Smart Fill
            </Button>
          </Group>
        </Stack>
      ) : null}

      <Text fw={600} mb="xs">
        Preview
      </Text>
      <Box
        className="board-theme-tab__preview"
        style={{
          backgroundColor: draft.selectedTheme.palette.canvasBg,
          ...(previewIsImage && previewBackground !== undefined
            ? { backgroundImage: `url(${previewBackground})` }
            : {}),
          ...(previewIsImage
            ? {
                backgroundSize: 'cover',
                backgroundRepeat: 'no-repeat',
                backgroundPosition:
                  (draft.backgroundImageScale ?? 'fill') === 'fit-top-left'
                    ? 'left top'
                    : (draft.backgroundImageScale ?? 'fill') === 'smart-fill'
                      ? `${Math.round(Math.max(0, Math.min(1, draft.backgroundFocalX ?? 0.5)) * 100)}% ${Math.round(
                          Math.max(0, Math.min(1, draft.backgroundFocalY ?? 0.5)) * 100,
                        )}%`
                      : 'center',
              }
            : {}),
        }}
      >
        <Box className="board-theme-tab__preview-nav" style={{ backgroundColor: draft.selectedTheme.palette.navbarBg }} />
        <Group gap="xs" wrap="nowrap" className="board-theme-tab__preview-columns">
          <Box
            className="board-theme-tab__preview-list"
            style={{
              backgroundColor: draft.selectedTheme.palette.listBg,
              color: draft.selectedTheme.palette.listHeaderText,
            }}
          >
            <Text fw={700} size="xs">
              Sample List
            </Text>
          </Box>
          <Box
            className="board-theme-tab__preview-list"
            style={{
              backgroundColor: draft.selectedTheme.palette.listBg,
              color: draft.selectedTheme.palette.listHeaderText,
            }}
          >
            <Text fw={700} size="xs">
              Another List
            </Text>
          </Box>
        </Group>
      </Box>
    </Stack>
  );
}
