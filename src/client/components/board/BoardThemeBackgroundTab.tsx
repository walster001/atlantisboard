import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  ColorInput,
  Divider,
  Group,
  Loader,
  NavLink,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPhoto, IconPalette } from '@tabler/icons-react';
import { api } from '../../utils/api.js';
import { transformBoard } from '../../utils/transform.js';
import {
  BOARD_DEFAULT_THEMES,
  createDefaultBoardThemeSettings,
  findBoardThemeById,
  normalizeBoardThemeSettings,
  resolveBoardBackgroundFromThemeSettings,
  type BoardThemeDefinition,
  type BoardThemeSettings,
} from '../../../shared/boardTheme.js';
import './boardThemeBackgroundTab.css';

interface BoardThemeBackgroundTabProps {
  boardId: string;
}

type ThemeNav = 'theme' | 'background';

const EDITABLE_THEME_FIELDS: ReadonlyArray<{ key: keyof BoardThemeDefinition['palette']; label: string }> = [
  { key: 'navbarBg', label: 'Navbar Color' },
  { key: 'navbarBorder', label: 'Navbar Border' },
  { key: 'canvasBg', label: 'Board Canvas Color' },
  { key: 'listBg', label: 'List / Column Color' },
  { key: 'listHeaderText', label: 'List Header Text' },
  { key: 'cardDetailBg', label: 'Card Detail Background' },
  { key: 'cardDetailText', label: 'Card Detail Text' },
  { key: 'cardDetailButtonBg', label: 'Button Color' },
  { key: 'cardDetailButtonText', label: 'Button Text Color' },
  { key: 'cardDetailButtonHoverBg', label: 'Button Hover Color' },
  { key: 'cardDetailButtonHoverText', label: 'Button Hover Text Color' },
  { key: 'scrollbarColor', label: 'Scrollbar Color' },
  { key: 'scrollbarTrackColor', label: 'Track Color' },
];

function cloneTheme(theme: BoardThemeDefinition): BoardThemeDefinition {
  return {
    id: theme.id,
    name: theme.name,
    palette: { ...theme.palette },
  };
}

function toThemeCardItems(settings: BoardThemeSettings): BoardThemeDefinition[] {
  const custom = settings.customThemes.map((theme) => cloneTheme(theme));
  return [...BOARD_DEFAULT_THEMES.map((theme) => cloneTheme(theme)), ...custom];
}

export function BoardThemeBackgroundTab({ boardId }: BoardThemeBackgroundTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSettings, setSavedSettings] = useState<BoardThemeSettings>(createDefaultBoardThemeSettings());
  const [draft, setDraft] = useState<BoardThemeSettings>(createDefaultBoardThemeSettings());
  const [nav, setNav] = useState<ThemeNav>('theme');

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.getBoard(boardId, { view: 'detail' });
        const board = transformBoard((response as { board: unknown }).board);
        const normalized = normalizeBoardThemeSettings(board.themeSettings, createDefaultBoardThemeSettings());
        if (!cancelled) {
          setSavedSettings(normalized);
          setDraft(normalized);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load board theme settings');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const themeCards = useMemo(() => toThemeCardItems(draft), [draft]);
  const hasUnsavedChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(savedSettings), [draft, savedSettings]);

  const handleSelectTheme = useCallback((themeId: string) => {
    setDraft((prev) => {
      const custom = prev.customThemes.find((theme) => theme.id === themeId);
      const selected = custom ?? findBoardThemeById(themeId) ?? prev.selectedTheme;
      const next = {
        ...prev,
        selectedThemeId: selected.id,
        selectedTheme: cloneTheme(selected),
      };
      if (next.backgroundMode === 'theme') {
        next.backgroundColor = next.selectedTheme.palette.canvasBg;
      }
      return next;
    });
  }, []);

  const handleThemeFieldChange = useCallback(
    (field: keyof BoardThemeDefinition['palette'], value: string) => {
      setDraft((prev) => ({
        ...prev,
        selectedTheme: {
          ...prev.selectedTheme,
          palette: {
            ...prev.selectedTheme.palette,
            [field]: value,
          },
        },
      }));
    },
    [],
  );

  const handleThemeNameChange = useCallback((value: string) => {
    setDraft((prev) => ({
      ...prev,
      selectedTheme: {
        ...prev.selectedTheme,
        name: value,
      },
    }));
  }, []);

  const handleSaveAsCustomTheme = useCallback(() => {
    setDraft((prev) => {
      const trimmedName = prev.selectedTheme.name.trim();
      const customId = `custom-${Date.now()}`;
      const newTheme: BoardThemeDefinition = {
        id: customId,
        name: trimmedName !== '' ? trimmedName : 'Custom Theme',
        palette: { ...prev.selectedTheme.palette },
      };
      return {
        ...prev,
        selectedThemeId: customId,
        selectedTheme: newTheme,
        customThemes: [...prev.customThemes.filter((theme) => theme.id !== customId), newTheme],
      };
    });
  }, []);

  const handleBackgroundModeChange = useCallback((mode: string | null) => {
    setDraft((prev) => ({
      ...prev,
      backgroundMode: mode === 'color' || mode === 'image' ? mode : prev.backgroundMode,
    }));
  }, []);

  const handleBackgroundImageFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.currentTarget.value = '';
      if (file == null) {
        return;
      }
      void (async () => {
        try {
          setUploadingImage(true);
          setError(null);
          const response = await api.uploadBoardBackgroundImage(boardId, file);
          const board = transformBoard((response as { board: unknown }).board);
          const normalized = normalizeBoardThemeSettings(
            board.themeSettings,
            normalizeBoardThemeSettings(draft, savedSettings),
          );
          setSavedSettings(normalized);
          setDraft(normalized);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Background image upload failed');
        } finally {
          setUploadingImage(false);
        }
      })();
    },
    [boardId, draft, savedSettings],
  );

  const handleDeleteBackgroundImage = useCallback(() => {
    void (async () => {
      try {
        setSaving(true);
        setError(null);
        const response = await api.deleteBoardBackgroundImage(boardId);
        const board = transformBoard((response as { board: unknown }).board);
        const normalized = normalizeBoardThemeSettings(
          board.themeSettings,
          normalizeBoardThemeSettings(draft, savedSettings),
        );
        setSavedSettings(normalized);
        setDraft(normalized);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete background image');
      } finally {
        setSaving(false);
      }
    })();
  }, [boardId, draft, savedSettings]);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);
      const normalized = normalizeBoardThemeSettings(draft, savedSettings);
      const background = resolveBoardBackgroundFromThemeSettings(normalized);
      await api.updateBoard(boardId, {
        themeSettings: normalized,
        ...(background !== undefined ? { background } : {}),
      });
      setSavedSettings(normalized);
      setDraft(normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save theme settings');
    } finally {
      setSaving(false);
    }
  }, [boardId, draft, savedSettings]);

  const previewBackground = resolveBoardBackgroundFromThemeSettings(draft);
  const previewIsImage = previewBackground != null && /^(https?:|data:|\/)/i.test(previewBackground);
  const hasBackgroundImage = (draft.backgroundImageUrl?.trim() ?? '') !== '';

  if (loading) {
    return (
      <Box py="xl" ta="center">
        <Loader size="sm" />
      </Box>
    );
  }

  return (
    <Box className="board-theme-tab">
      <Group align="flex-start" wrap="nowrap" gap="md">
        <Stack gap={4} className="board-theme-tab__sidenav">
          <NavLink
            label="Theme / Colouring"
            leftSection={<IconPalette size={18} stroke={1.5} />}
            active={nav === 'theme'}
            onClick={() => setNav('theme')}
            variant="subtle"
          />
          <NavLink
            label="Background"
            leftSection={<IconPhoto size={18} stroke={1.5} />}
            active={nav === 'background'}
            onClick={() => setNav('background')}
            variant="subtle"
          />
        </Stack>

        <Box className="board-theme-tab__main">
          {error != null ? <Alert color="red">{error}</Alert> : null}

          {nav === 'theme' ? (
            <Stack gap="md">
              <Box>
                <Text fw={700} size="xl">
                  Board Themes
                </Text>
                <Text c="dimmed">Select a theme to apply to this board.</Text>
              </Box>

              <SimpleGrid cols={{ base: 1, sm: 2, md: 2, lg: 3 }} spacing="md">
                {themeCards.map((theme) => {
                  const selected = theme.id === draft.selectedThemeId;
                  return (
                    <Card
                      key={theme.id}
                      className={`board-theme-card${selected ? ' board-theme-card--selected' : ''}`}
                      withBorder
                      onClick={() => handleSelectTheme(theme.id)}
                    >
                      <Box className="board-theme-card__preview" style={{ backgroundColor: theme.palette.listBg }}>
                        <Box
                          className="board-theme-card__preview-nav"
                          style={{ backgroundColor: theme.palette.navbarBg }}
                        />
                      </Box>
                      <Group justify="space-between" mt="xs">
                        <Text fw={600}>{theme.name}</Text>
                        {BOARD_DEFAULT_THEMES.some((entry) => entry.id === theme.id) ? (
                          <Badge variant="light">Default</Badge>
                        ) : (
                          <Badge variant="outline">Custom</Badge>
                        )}
                      </Group>
                    </Card>
                  );
                })}
              </SimpleGrid>

              <Divider />

              <TextInput
                label="Theme Name"
                value={draft.selectedTheme.name}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  handleThemeNameChange(event.currentTarget.value)
                }
              />

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                {EDITABLE_THEME_FIELDS.map((field) => (
                  <ColorInput
                    key={field.key}
                    label={field.label}
                    value={draft.selectedTheme.palette[field.key]}
                    onChange={(value) => handleThemeFieldChange(field.key, value)}
                    withPicker
                  />
                ))}
              </SimpleGrid>

              <Group justify="space-between">
                <Switch
                  label="Intelligent Contrast"
                  checked={draft.smartContrast}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      smartContrast: event.currentTarget.checked,
                    }))
                  }
                />
                <Button variant="light" onClick={handleSaveAsCustomTheme}>
                  Save as Custom Theme
                </Button>
              </Group>
            </Stack>
          ) : (
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
                  onClick={() => handleBackgroundModeChange('color')}
                >
                  Color
                </Button>
                <Button
                  variant={draft.backgroundMode === 'image' ? 'filled' : 'default'}
                  onClick={() => handleBackgroundModeChange('image')}
                >
                  Image
                </Button>
              </Group>

              {draft.backgroundMode === 'color' ? (
                <Stack gap="xs">
                  <ColorInput
                    label="Custom Color"
                    value={draft.backgroundColor ?? draft.selectedTheme.palette.canvasBg}
                    onChange={(value) =>
                      setDraft((prev) => ({
                        ...prev,
                        backgroundColor: value,
                      }))
                    }
                    withPicker
                  />
                  <Button
                    variant="filled"
                    size="sm"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        backgroundMode: 'color',
                      }))
                    }
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
                        disabled={saving}
                      >
                        Replace Background
                        <input
                          hidden
                          type="file"
                          accept="image/png,image/jpeg,image/gif,image/webp"
                          onChange={handleBackgroundImageFile}
                        />
                      </Button>
                      <Button
                        variant="outline"
                        color="red"
                        size="sm"
                        disabled={saving || uploadingImage}
                        onClick={handleDeleteBackgroundImage}
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
                      disabled={saving}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      Upload Image
                      <input
                        hidden
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        onChange={handleBackgroundImageFile}
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
                      variant={(draft.backgroundImageScale ?? 'fill') === 'stretch' ? 'filled' : 'default'}
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          backgroundImageScale: 'stretch',
                        }))
                      }
                    >
                      Stretch
                    </Button>
                    <Button
                      size="xs"
                      variant={(draft.backgroundImageScale ?? 'fill') === 'fill' ? 'filled' : 'default'}
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          backgroundImageScale: 'fill',
                        }))
                      }
                    >
                      Fill
                    </Button>
                    <Button
                      size="xs"
                      variant={(draft.backgroundImageScale ?? 'fill') === 'fit' ? 'filled' : 'default'}
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          backgroundImageScale: 'fit',
                        }))
                      }
                    >
                      Fit
                    </Button>
                  </Group>
                </Stack>
              ) : null}
            </Stack>
          )}

          <Divider my="md" />

          <Text fw={600} mb="xs">
            Preview
          </Text>
          <Box
            className="board-theme-tab__preview"
            style={{
              backgroundColor: draft.selectedTheme.palette.canvasBg,
              ...(previewIsImage ? { backgroundImage: `url(${previewBackground})` } : {}),
              ...(previewIsImage
                ? {
                    backgroundSize:
                      (draft.backgroundImageScale ?? 'fill') === 'stretch'
                        ? '100% 100%'
                        : (draft.backgroundImageScale ?? 'fill') === 'fit'
                          ? 'contain'
                          : 'cover',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
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

          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              disabled={!hasUnsavedChanges || saving}
              onClick={() => setDraft(savedSettings)}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} loading={saving} disabled={!hasUnsavedChanges}>
              Save Changes
            </Button>
          </Group>
        </Box>
      </Group>
    </Box>
  );
}
