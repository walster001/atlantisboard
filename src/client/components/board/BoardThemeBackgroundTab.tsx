import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Alert, Box, Button, Flex, Group, Loader, NavLink, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconPalette, IconPhoto } from '@tabler/icons-react';
import smartcrop from 'smartcrop';
import { api } from '../../utils/api.js';
import { useAuthContext } from '../../contexts/AuthContext.js';
import { useBoardThemes } from '../../hooks/useBoardThemes.js';
import { transformBoard } from '../../utils/transform.js';
import {
  BOARD_DEFAULT_THEME_ID,
  createDefaultBoardThemeSettings,
  findBoardThemeById,
  normalizeBoardThemeSettings,
  resolveBoardBackgroundFromThemeSettings,
  type BoardThemeDefinition,
  type BoardThemeSettings,
} from '../../../shared/boardTheme.js';
import { BoardThemeBackgroundPanel } from './BoardThemeBackgroundPanel.js';
import { BoardThemeColouringPanel } from './BoardThemeColouringPanel.js';
import { BoardThemeEditorModal } from './BoardThemeEditorModal.js';
import {
  buildAddThemeDraft,
  buildEditThemeDraft,
  cloneTheme,
  toThemeCardItems,
  type BoardBackgroundImageScaleOption,
} from './boardThemeTabHelpers.js';
import './boardThemeBackgroundTab.css';

interface BoardThemeBackgroundTabProps {
  boardId: string;
  canChangeTheme: boolean;
  canManageCustomThemes: boolean;
  onThemeLivePatch?: (patch: { themeSettings: BoardThemeSettings; background?: string }) => void;
  initialNav?: ThemeNav;
  /** Board settings phone / PWA shell: hide inner Theme/Background nav; section comes from parent rows. */
  mobileLayout?: boolean;
}

type ThemeNav = 'theme' | 'background';

export function BoardThemeBackgroundTab({
  boardId,
  canChangeTheme,
  canManageCustomThemes,
  onThemeLivePatch,
  initialNav,
  mobileLayout = false,
}: BoardThemeBackgroundTabProps) {
  const { refreshUser } = useAuthContext();
  const { catalog, systemThemes, reload: reloadThemes } = useBoardThemes();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSettings, setSavedSettings] = useState<BoardThemeSettings>(createDefaultBoardThemeSettings());
  const [draft, setDraft] = useState<BoardThemeSettings>(createDefaultBoardThemeSettings());
  const [nav, setNav] = useState<ThemeNav>(() => initialNav ?? 'theme');
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const [themeEditorVariant, setThemeEditorVariant] = useState<'add' | 'edit'>('edit');
  const [themeEditorInitial, setThemeEditorInitial] = useState<BoardThemeSettings>(createDefaultBoardThemeSettings());
  const [themeEditorSaving, setThemeEditorSaving] = useState(false);
  const [themeEditorError, setThemeEditorError] = useState<string | null>(null);
  const [appCustomThemes, setAppCustomThemes] = useState<BoardThemeDefinition[]>([]);

  const mergeCustomThemes = useCallback(
    (globalThemes: readonly BoardThemeDefinition[], boardThemes: readonly BoardThemeDefinition[]): BoardThemeDefinition[] => {
      const next: BoardThemeDefinition[] = [];
      const seen = new Set<string>();
      for (const source of [globalThemes, boardThemes]) {
        for (const theme of source) {
          const id = theme.id.trim();
          if (id === '' || seen.has(id)) {
            continue;
          }
          seen.add(id);
          next.push(cloneTheme(theme));
        }
      }
      return next;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.getBoard(boardId, { view: 'detail' });
        const board = transformBoard((response as { board: unknown }).board);
        const normalized = normalizeBoardThemeSettings(
          board.themeSettings,
          createDefaultBoardThemeSettings(undefined, catalog),
          catalog,
        );
        const globalThemes = catalog.customThemes.map((theme) => cloneTheme(theme));
        const mergedCustomThemes = mergeCustomThemes(globalThemes, normalized.customThemes);
        const normalizedWithGlobal = normalizeBoardThemeSettings(
          {
            ...normalized,
            customThemes: mergedCustomThemes,
          },
          normalized,
          catalog,
        );
        if (!cancelled) {
          setAppCustomThemes(mergedCustomThemes);
          setSavedSettings(normalizedWithGlobal);
          setDraft(normalizedWithGlobal);
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
  }, [boardId, catalog, mergeCustomThemes]);

  const hasUnsavedChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(savedSettings), [draft, savedSettings]);
  const themeCards = useMemo(() => toThemeCardItems(draft, systemThemes), [draft, systemThemes]);
  const previewBackground = resolveBoardBackgroundFromThemeSettings(draft);
  const previewIsImage = previewBackground != null && /^(https?:|data:|\/)/i.test(previewBackground);

  const handleSelectTheme = useCallback((themeId: string) => {
    if (!canChangeTheme) {
      return;
    }
    const previousDraft = draft;
    const previousBackground = resolveBoardBackgroundFromThemeSettings(previousDraft);
    const custom = previousDraft.customThemes.find((theme) => theme.id === themeId);
    const selected = custom ?? findBoardThemeById(themeId, catalog) ?? previousDraft.selectedTheme;
    const nextDraft: BoardThemeSettings = {
      ...previousDraft,
      selectedThemeId: selected.id,
      selectedTheme: cloneTheme(selected),
      backgroundColor: selected.palette.canvasBg,
    };
    const normalized = normalizeBoardThemeSettings(nextDraft, previousDraft, catalog);
    const background = resolveBoardBackgroundFromThemeSettings(normalized);
    setDraft(normalized);
    onThemeLivePatch?.({
      themeSettings: normalized,
      ...(background !== undefined ? { background } : {}),
    });
    void (async () => {
      try {
        setSaving(true);
        setError(null);
        await api.updateBoard(boardId, {
          themeSettings: { ...normalized, customThemes: [] },
          ...(background !== undefined ? { background } : {}),
        });
        setSavedSettings(normalized);
      } catch (err) {
        setDraft(previousDraft);
        onThemeLivePatch?.({
          themeSettings: previousDraft,
          ...(previousBackground !== undefined ? { background: previousBackground } : {}),
        });
        setError(err instanceof Error ? err.message : 'Failed to apply theme');
      } finally {
        setSaving(false);
      }
    })();
  }, [boardId, canChangeTheme, catalog, draft, onThemeLivePatch]);

  const openThemeEditorAdd = useCallback(() => {
    if (!canManageCustomThemes) {
      return;
    }
    setThemeEditorError(null);
    setThemeEditorInitial(buildAddThemeDraft(draft));
    setThemeEditorVariant('add');
    setThemeEditorOpen(true);
  }, [canManageCustomThemes, draft]);

  const openThemeEditorEdit = useCallback(
    (themeId: string) => {
      if (!canManageCustomThemes) {
        return;
      }
      setThemeEditorError(null);
      setThemeEditorInitial(buildEditThemeDraft(draft, themeId));
      setThemeEditorVariant('edit');
      setThemeEditorOpen(true);
    },
    [canManageCustomThemes, draft],
  );

  const handleThemeEditorSave = useCallback(
    async (next: BoardThemeSettings) => {
      if (!canManageCustomThemes) {
        return;
      }
      try {
        setThemeEditorSaving(true);
        setThemeEditorError(null);
        const normalized = normalizeBoardThemeSettings(next, draft, catalog);
        const nextGlobalThemes = normalized.customThemes.map((theme) => cloneTheme(theme));
        await api.updateUserPreferences({ customBoardThemes: nextGlobalThemes });
        await refreshUser();
        reloadThemes();
        setAppCustomThemes(nextGlobalThemes);
        const background = resolveBoardBackgroundFromThemeSettings(normalized);
        await api.updateBoard(boardId, {
          themeSettings: { ...normalized, customThemes: [] },
          ...(background !== undefined ? { background } : {}),
        });
        setSavedSettings(normalized);
        setDraft(normalized);
        setThemeEditorOpen(false);
      } catch (err) {
        setThemeEditorError(err instanceof Error ? err.message : 'Failed to save theme');
      } finally {
        setThemeEditorSaving(false);
      }
    },
    [boardId, canManageCustomThemes, catalog, draft, refreshUser, reloadThemes],
  );

  const handleThemeEditorClose = useCallback(() => {
    setThemeEditorError(null);
    setThemeEditorOpen(false);
  }, []);

  const handleDuplicateCustomTheme = useCallback((theme: BoardThemeDefinition) => {
    if (!canManageCustomThemes) {
      return;
    }
    const newId = `custom-${Date.now()}`;
    const copy: BoardThemeDefinition = {
      id: newId,
      name: `${theme.name.trim()} (copy)`,
      palette: { ...theme.palette },
    };
    setDraft((prev) =>
      normalizeBoardThemeSettings(
        {
          ...prev,
          customThemes: [...prev.customThemes, copy],
          selectedThemeId: newId,
          selectedTheme: cloneTheme(copy),
        },
        prev,
      ),
    );
    const nextGlobalThemes = [...appCustomThemes.map((entry) => cloneTheme(entry)), copy];
    setAppCustomThemes(nextGlobalThemes);
    void api.updateUserPreferences({ customBoardThemes: nextGlobalThemes }).then(
      () => refreshUser(),
      () => {
        setError('Failed to save app-wide custom theme copy');
      },
    ).catch(() => {
      setError('Failed to save app-wide custom theme copy');
    });
  }, [appCustomThemes, canManageCustomThemes]);

  const handleDeleteCustomTheme = useCallback((theme: BoardThemeDefinition) => {
    if (!canManageCustomThemes) {
      return;
    }
    modals.openConfirmModal({
      title: 'Delete theme',
      children: (
        <Text size="sm">
          Delete &quot;{theme.name}&quot;? This removes the theme from this board.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        setDraft((prev) => {
          const nextCustom = prev.customThemes.filter((t) => t.id !== theme.id);
          const wasSelected = prev.selectedThemeId === theme.id;
          const fallback =
            findBoardThemeById(BOARD_DEFAULT_THEME_ID, catalog) ??
            systemThemes[0] ??
            createDefaultBoardThemeSettings(undefined, catalog).selectedTheme;
          const selectedTheme = wasSelected ? cloneTheme(fallback) : prev.selectedTheme;
          const selectedThemeId = wasSelected ? fallback.id : prev.selectedThemeId;
          const baseNext: BoardThemeSettings = {
            ...prev,
            customThemes: nextCustom,
            selectedThemeId,
            selectedTheme,
          };
          const merged: BoardThemeSettings =
            wasSelected && prev.backgroundMode === 'theme'
              ? { ...baseNext, backgroundColor: selectedTheme.palette.canvasBg }
              : baseNext;
          const normalized = normalizeBoardThemeSettings(merged, prev, catalog);
          const nextGlobalThemes = normalized.customThemes.map((entry) => cloneTheme(entry));
          setAppCustomThemes(nextGlobalThemes);
          void api.updateUserPreferences({ customBoardThemes: nextGlobalThemes }).then(
            () => refreshUser(),
            () => {
              setError('Failed to delete app-wide custom theme');
            },
          ).catch(() => {
            setError('Failed to delete app-wide custom theme');
          });
          return normalized;
        });
      },
    });
  }, [canManageCustomThemes, catalog, refreshUser, systemThemes]);

  const handleBackgroundModeChange = useCallback((mode: string | null) => {
    if (!canChangeTheme) {
      return;
    }
    setDraft((prev) => ({
      ...prev,
      backgroundMode: mode === 'color' || mode === 'image' ? mode : prev.backgroundMode,
      ...(mode === 'image'
        ? {
            boardOpacity:
              typeof prev.boardOpacity === 'number' && Number.isFinite(prev.boardOpacity)
                ? prev.boardOpacity
                : 0.8,
          }
        : {}),
    }));
  }, [canChangeTheme]);

  const handleBackgroundImageFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!canChangeTheme) {
        return;
      }
      const file = event.target.files?.[0];
      event.currentTarget.value = '';
      if (file == null) {
        return;
      }
      void (async () => {
        try {
          setUploadingImage(true);
          setError(null);
          let smartFocalX = 0.5;
          let smartFocalY = 0.5;
          let objectUrl: string | null = null;
          try {
            objectUrl = URL.createObjectURL(file);
            const activeObjectUrl = objectUrl;
            const image = await new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = () => reject(new Error('Unable to read image dimensions'));
              img.src = activeObjectUrl;
            });
            const crop = await smartcrop.crop(image, {
              width: Math.max(1, Math.round(image.width * 0.65)),
              height: Math.max(1, Math.round(image.height * 0.65)),
            });
            const cropCenterX = crop.topCrop.x + crop.topCrop.width / 2;
            const cropCenterY = crop.topCrop.y + crop.topCrop.height / 2;
            smartFocalX = image.width > 0 ? cropCenterX / image.width : 0.5;
            smartFocalY = image.height > 0 ? cropCenterY / image.height : 0.5;
          } catch {
            smartFocalX = 0.5;
            smartFocalY = 0.5;
          } finally {
            if (objectUrl != null) {
              URL.revokeObjectURL(objectUrl);
            }
          }
          const response = await api.uploadBoardBackgroundImage(boardId, file, {
            backgroundImageScale: (draft.backgroundImageScale ?? 'fill') as BoardBackgroundImageScaleOption,
            backgroundFocalX: Math.max(0, Math.min(1, smartFocalX)),
            backgroundFocalY: Math.max(0, Math.min(1, smartFocalY)),
          });
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
    [boardId, canChangeTheme, draft, savedSettings],
  );

  const handleDeleteBackgroundImage = useCallback(() => {
    if (!canChangeTheme) {
      return;
    }
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
  }, [boardId, canChangeTheme, draft, savedSettings]);

  const handleSave = useCallback(async () => {
    if (!canChangeTheme) {
      return;
    }
    const previousDraft = draft;
    const previousBackground = resolveBoardBackgroundFromThemeSettings(previousDraft);
    try {
      setSaving(true);
      setError(null);
      const normalized = normalizeBoardThemeSettings(draft, savedSettings);
      const background = resolveBoardBackgroundFromThemeSettings(normalized);
      // Apply immediately so UI updates without waiting for API.
      onThemeLivePatch?.({
        themeSettings: normalized,
        ...(background !== undefined ? { background } : {}),
      });
      await api.updateBoard(boardId, {
        themeSettings: { ...normalized, customThemes: [] },
        ...(background !== undefined ? { background } : {}),
      });
      setSavedSettings(normalized);
      setDraft(normalized);
    } catch (err) {
      // Roll back optimistic theme patch.
      onThemeLivePatch?.({
        themeSettings: previousDraft,
        ...(previousBackground !== undefined ? { background: previousBackground } : {}),
      });
      setError(err instanceof Error ? err.message : 'Failed to save theme settings');
    } finally {
      setSaving(false);
    }
  }, [boardId, canChangeTheme, draft, onThemeLivePatch, savedSettings]);

  const hasBackgroundImage = (draft.backgroundImageUrl?.trim() ?? '') !== '';

  if (loading) {
    return (
      <Box py="xl" ta="center">
        <Loader size="sm" />
      </Box>
    );
  }

  return (
    <Box className={mobileLayout ? 'board-theme-tab board-theme-tab--mobile-embedded' : 'board-theme-tab'}>
      <Flex
        align="stretch"
        wrap="nowrap"
        gap="md"
        direction={mobileLayout ? 'column' : 'row'}
        className="board-theme-tab__layout"
      >
        {!mobileLayout ? (
          <Stack gap={4} className="board-theme-tab__sidenav board-theme-tab__sidenav--sticky">
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
        ) : null}

        <Box
          className={
            mobileLayout
              ? 'board-theme-tab__main board-theme-tab__main--scrollable board-theme-tab__main--mobile-full'
              : 'board-theme-tab__main board-theme-tab__main--scrollable'
          }
        >
          {error != null ? <Alert color="red">{error}</Alert> : null}

          {nav === 'theme' ? (
            <BoardThemeColouringPanel
              canChangeTheme={canChangeTheme}
              canManageCustomThemes={canManageCustomThemes}
              draft={draft}
              systemThemes={systemThemes}
              themeCards={themeCards}
              saving={saving}
              hasUnsavedChanges={hasUnsavedChanges}
              onSelectTheme={handleSelectTheme}
              onAddTheme={openThemeEditorAdd}
              onEditTheme={openThemeEditorEdit}
              onDuplicateTheme={handleDuplicateCustomTheme}
              onDeleteTheme={handleDeleteCustomTheme}
              onSaveChanges={() => void handleSave()}
              mobileLayout={mobileLayout}
            />
          ) : (
            <BoardThemeBackgroundPanel
              canChangeTheme={canChangeTheme}
              draft={draft}
              setDraft={setDraft}
              saving={saving}
              uploadingImage={uploadingImage}
              previewBackground={previewBackground}
              previewIsImage={previewIsImage}
              hasBackgroundImage={hasBackgroundImage}
              onBackgroundModeChange={handleBackgroundModeChange}
              onBackgroundImageFile={handleBackgroundImageFile}
              onDeleteBackgroundImage={handleDeleteBackgroundImage}
            />
          )}

          {nav === 'background' ? (
            <Group justify="flex-end" mt="md">
              <Button
                variant="default"
                disabled={!canChangeTheme || !hasUnsavedChanges || saving || themeEditorSaving}
                onClick={() => setDraft(savedSettings)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleSave()}
                loading={saving}
                disabled={!canChangeTheme || !hasUnsavedChanges || themeEditorSaving}
              >
                Save Changes
              </Button>
            </Group>
          ) : null}
        </Box>
      </Flex>

      <BoardThemeEditorModal
        opened={themeEditorOpen}
        variant={themeEditorVariant}
        initialSettings={themeEditorInitial}
        isSaving={themeEditorSaving}
        error={themeEditorError}
        onClose={handleThemeEditorClose}
        onSave={handleThemeEditorSave}
      />
    </Box>
  );
}
