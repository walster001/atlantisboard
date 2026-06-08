import { useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { Box, Button, ColorInput, Group, NumberInput, Stack, Text } from '@mantine/core';
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
  const boardOpacityPercent =
    typeof draft.boardOpacity === 'number' && Number.isFinite(draft.boardOpacity)
      ? Math.round(Math.max(0.1, Math.min(1, draft.boardOpacity)) * 100)
      : 80;
  const [opacityInput, setOpacityInput] = useState<number | ''>(boardOpacityPercent);
  const [opacityEditing, setOpacityEditing] = useState(false);
  const displayedOpacityInput = opacityEditing ? opacityInput : boardOpacityPercent;

  const listSurfacePct = `${draft.backgroundMode === 'image' ? boardOpacityPercent : 100}%`;
  const navBgSurface = draft.selectedTheme.palette.navbarBg;
  const listBgSurface =
    draft.backgroundMode === 'image'
      ? `color-mix(in srgb, ${draft.selectedTheme.palette.listBg} ${listSurfacePct}, transparent)`
      : draft.selectedTheme.palette.listBg;
  return (
    <Stack gap="md">
      <Box>
        <Text fw={700} size="xl">
          Board Background
        </Text>
        <Text c="dimmed">Customize the background of your board. Choose a color or upload an image.</Text>
      </Box>

      <Group align="flex-end" gap="sm" wrap="wrap">
        <Button
          variant={draft.backgroundMode === 'color' ? 'filled' : 'default'}
          onClick={() => onBackgroundModeChange('color')}
          disabled={!canChangeTheme}
        >
          Color
        </Button>
        <Group gap="sm" wrap="nowrap" align="flex-end">
          <Button
            variant={draft.backgroundMode === 'image' ? 'filled' : 'default'}
            onClick={() => onBackgroundModeChange('image')}
            disabled={!canChangeTheme}
          >
            Image
          </Button>
          {draft.backgroundMode === 'image' ? (
            <Group gap={8} wrap="nowrap" align="center">
              <NumberInput
                value={displayedOpacityInput}
                min={10}
                max={100}
                step={5}
                allowDecimal={false}
                allowNegative={false}
                decimalScale={0}
                disabled={!canChangeTheme}
                rightSection="%"
                styles={{
                  root: { width: 'fit-content', maxWidth: '100%' },
                  input: { width: '8.5rem' },
                  section: { width: '2.25rem' },
                }}
                onFocus={() => setOpacityEditing(true)}
                onBlur={() => {
                  setOpacityEditing(false);
                  if (opacityInput === '') {
                    setOpacityInput(boardOpacityPercent);
                    return;
                  }
                  const raw = typeof opacityInput === 'number' ? opacityInput : Number.parseFloat(String(opacityInput));
                  if (!Number.isFinite(raw)) {
                    setOpacityInput(boardOpacityPercent);
                    return;
                  }
                  const clamped = Math.max(10, Math.min(100, Math.round(raw)));
                  setOpacityInput(clamped);
                  setDraft((prev) => {
                    if (!canChangeTheme) {
                      return prev;
                    }
                    return {
                      ...prev,
                      boardOpacity: Math.max(0.1, Math.min(1, clamped / 100)),
                    };
                  });
                }}
                onChange={(value) => {
                  const nextPercentRaw =
                    typeof value === 'number'
                      ? value
                      : typeof value === 'string'
                        ? Number.parseFloat(value)
                        : value === ''
                          ? NaN
                          : NaN;
                  if (!Number.isFinite(nextPercentRaw)) {
                    setOpacityInput('');
                    return;
                  }
                  const nextPercent = nextPercentRaw;
                  setOpacityInput(nextPercent);
                  setDraft((prev) => {
                    if (!canChangeTheme) {
                      return prev;
                    }
                    return {
                      ...prev,
                      boardOpacity: Math.max(0.1, Math.min(1, nextPercent / 100)),
                    };
                  });
                }}
              />
              <Text size="sm" fw={600}>
                Board Opacity
              </Text>
            </Group>
          ) : null}
        </Group>
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
        <Box
          className="board-theme-tab__preview-nav"
          style={{
            backgroundColor: navBgSurface,
          }}
        />
        <Group gap="xs" wrap="nowrap" className="board-theme-tab__preview-columns">
          <Box
            className="board-theme-tab__preview-list"
            style={{
              backgroundColor: listBgSurface,
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
              backgroundColor: listBgSurface,
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
