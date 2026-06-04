import { useCallback, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { modals } from '@mantine/modals';
import { Text } from '@mantine/core';
import {
  findBoardThemeById,
  normalizeBoardThemeSettings,
  type BoardThemeDefinition,
  type BoardThemeSettings,
} from '../../../shared/boardTheme.js';
import type { BoardThemeCatalog } from '../../../shared/boardThemeCatalog.js';
import { cloneTheme } from '../../components/board/boardThemeTabHelpers.js';
import {
  applyDeletedCustomThemeToDraft,
  applyThemeSelectionToBoard,
  buildDuplicatedCustomTheme,
  buildThemeEditorInitial,
  deleteBoardBackgroundImageAction,
  persistBoardThemePatch,
  saveCustomThemeEditor,
  updateAppWideCustomThemes,
  uploadBoardBackgroundImageAction,
} from './boardThemeBackgroundActions.js';

export interface BoardThemeBackgroundTabHandlerDeps {
  readonly boardId: string;
  readonly canChangeTheme: boolean;
  readonly canManageCustomThemes: boolean;
  readonly catalog: BoardThemeCatalog;
  readonly systemThemes: readonly BoardThemeDefinition[];
  readonly draft: BoardThemeSettings;
  readonly savedSettings: BoardThemeSettings;
  readonly appCustomThemes: readonly BoardThemeDefinition[];
  readonly setDraft: Dispatch<SetStateAction<BoardThemeSettings>>;
  readonly setSavedSettings: Dispatch<SetStateAction<BoardThemeSettings>>;
  readonly setAppCustomThemes: Dispatch<SetStateAction<BoardThemeDefinition[]>>;
  readonly setSaving: Dispatch<SetStateAction<boolean>>;
  readonly setUploadingImage: Dispatch<SetStateAction<boolean>>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly setThemeEditorOpen: Dispatch<SetStateAction<boolean>>;
  readonly setThemeEditorVariant: Dispatch<SetStateAction<'add' | 'edit'>>;
  readonly setThemeEditorInitial: Dispatch<SetStateAction<BoardThemeSettings>>;
  readonly setThemeEditorSaving: Dispatch<SetStateAction<boolean>>;
  readonly setThemeEditorError: Dispatch<SetStateAction<string | null>>;
  readonly patchLive: (settings: BoardThemeSettings) => void;
  readonly refreshUser: () => Promise<void>;
  readonly reloadThemes: () => void;
}

export function useBoardThemeBackgroundTabHandlers(deps: BoardThemeBackgroundTabHandlerDeps) {
  const {
    boardId,
    canChangeTheme,
    canManageCustomThemes,
    catalog,
    systemThemes,
    draft,
    savedSettings,
    appCustomThemes,
    setDraft,
    setSavedSettings,
    setAppCustomThemes,
    setSaving,
    setUploadingImage,
    setError,
    setThemeEditorOpen,
    setThemeEditorVariant,
    setThemeEditorInitial,
    setThemeEditorSaving,
    setThemeEditorError,
    patchLive,
    refreshUser,
    reloadThemes,
  } = deps;

  const handleSelectTheme = useCallback(
    (themeId: string) => {
      if (!canChangeTheme) {
        return;
      }
      const previousDraft = draft;
      const custom = previousDraft.customThemes.find((theme) => theme.id === themeId);
      const selected = custom ?? findBoardThemeById(themeId, catalog) ?? previousDraft.selectedTheme;
      const optimistic = normalizeBoardThemeSettings(
        {
          ...previousDraft,
          selectedThemeId: selected.id,
          selectedTheme: cloneTheme(selected),
          backgroundColor: selected.palette.canvasBg,
        },
        previousDraft,
        catalog,
      );
      setDraft(optimistic);
      patchLive(optimistic);
      void (async () => {
        try {
          setSaving(true);
          setError(null);
          const normalized = await applyThemeSelectionToBoard({
            boardId,
            catalog,
            previousDraft,
            themeId,
          });
          setSavedSettings(normalized);
          setDraft(normalized);
        } catch (err) {
          setDraft(previousDraft);
          patchLive(previousDraft);
          setError(err instanceof Error ? err.message : 'Failed to apply theme');
        } finally {
          setSaving(false);
        }
      })();
    },
    [boardId, canChangeTheme, catalog, draft, patchLive, setDraft, setError, setSavedSettings, setSaving],
  );

  const openThemeEditorAdd = useCallback(() => {
    if (!canManageCustomThemes) {
      return;
    }
    setThemeEditorError(null);
    setThemeEditorInitial(buildThemeEditorInitial('add', draft));
    setThemeEditorVariant('add');
    setThemeEditorOpen(true);
  }, [canManageCustomThemes, draft, setThemeEditorError, setThemeEditorInitial, setThemeEditorOpen, setThemeEditorVariant]);

  const openThemeEditorEdit = useCallback(
    (themeId: string) => {
      if (!canManageCustomThemes) {
        return;
      }
      setThemeEditorError(null);
      setThemeEditorInitial(buildThemeEditorInitial('edit', draft, themeId));
      setThemeEditorVariant('edit');
      setThemeEditorOpen(true);
    },
    [canManageCustomThemes, draft, setThemeEditorError, setThemeEditorInitial, setThemeEditorOpen, setThemeEditorVariant],
  );

  const handleThemeEditorSave = useCallback(
    async (next: BoardThemeSettings) => {
      if (!canManageCustomThemes) {
        return;
      }
      try {
        setThemeEditorSaving(true);
        setThemeEditorError(null);
        const { normalized, appCustomThemes: nextThemes } = await saveCustomThemeEditor({
          boardId,
          catalog,
          draft,
          next,
          refreshUser,
          reloadThemes,
        });
        setAppCustomThemes(nextThemes);
        setSavedSettings(normalized);
        setDraft(normalized);
        setThemeEditorOpen(false);
      } catch (err) {
        setThemeEditorError(err instanceof Error ? err.message : 'Failed to save theme');
      } finally {
        setThemeEditorSaving(false);
      }
    },
    [
      boardId,
      canManageCustomThemes,
      catalog,
      draft,
      refreshUser,
      reloadThemes,
      setAppCustomThemes,
      setDraft,
      setSavedSettings,
      setThemeEditorError,
      setThemeEditorOpen,
      setThemeEditorSaving,
    ],
  );

  const handleThemeEditorClose = useCallback(() => {
    setThemeEditorError(null);
    setThemeEditorOpen(false);
  }, [setThemeEditorError, setThemeEditorOpen]);

  const handleDuplicateCustomTheme = useCallback(
    (theme: BoardThemeDefinition) => {
      if (!canManageCustomThemes) {
        return;
      }
      const copy = buildDuplicatedCustomTheme(theme);
      setDraft((prev) =>
        normalizeBoardThemeSettings(
          {
            ...prev,
            customThemes: [...prev.customThemes, copy],
            selectedThemeId: copy.id,
            selectedTheme: cloneTheme(copy),
          },
          prev,
        ),
      );
      const nextGlobalThemes = [...appCustomThemes.map((entry) => cloneTheme(entry)), copy];
      setAppCustomThemes(nextGlobalThemes);
      void updateAppWideCustomThemes(nextGlobalThemes, refreshUser).catch(() => {
        setError('Failed to save app-wide custom theme copy');
      });
    },
    [appCustomThemes, canManageCustomThemes, refreshUser, setAppCustomThemes, setDraft, setError],
  );

  const handleDeleteCustomTheme = useCallback(
    (theme: BoardThemeDefinition) => {
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
            const normalized = applyDeletedCustomThemeToDraft({
              prev,
              themeId: theme.id,
              catalog,
              systemThemes,
            });
            const nextGlobalThemes = normalized.customThemes.map((entry) => cloneTheme(entry));
            setAppCustomThemes(nextGlobalThemes);
            void updateAppWideCustomThemes(nextGlobalThemes, refreshUser).catch(() => {
              setError('Failed to delete app-wide custom theme');
            });
            return normalized;
          });
        },
      });
    },
    [canManageCustomThemes, catalog, refreshUser, setAppCustomThemes, setDraft, setError, systemThemes],
  );

  const handleBackgroundModeChange = useCallback(
    (mode: string | null) => {
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
    },
    [canChangeTheme, setDraft],
  );

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
          const normalized = await uploadBoardBackgroundImageAction({
            boardId,
            file,
            draft,
            savedSettings,
          });
          setSavedSettings(normalized);
          setDraft(normalized);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Background image upload failed');
        } finally {
          setUploadingImage(false);
        }
      })();
    },
    [boardId, canChangeTheme, draft, savedSettings, setDraft, setError, setSavedSettings, setUploadingImage],
  );

  const handleDeleteBackgroundImage = useCallback(() => {
    if (!canChangeTheme) {
      return;
    }
    void (async () => {
      try {
        setSaving(true);
        setError(null);
        const normalized = await deleteBoardBackgroundImageAction({ boardId, draft, savedSettings });
        setSavedSettings(normalized);
        setDraft(normalized);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete background image');
      } finally {
        setSaving(false);
      }
    })();
  }, [boardId, canChangeTheme, draft, savedSettings, setDraft, setError, setSavedSettings, setSaving]);

  const handleSave = useCallback(async () => {
    if (!canChangeTheme) {
      return;
    }
    const previousDraft = draft;
    try {
      setSaving(true);
      setError(null);
      const normalized = normalizeBoardThemeSettings(draft, savedSettings);
      patchLive(normalized);
      const persisted = await persistBoardThemePatch(boardId, normalized);
      setSavedSettings(persisted);
      setDraft(persisted);
    } catch (err) {
      patchLive(previousDraft);
      setError(err instanceof Error ? err.message : 'Failed to save theme settings');
    } finally {
      setSaving(false);
    }
  }, [boardId, canChangeTheme, draft, patchLive, savedSettings, setDraft, setError, setSavedSettings, setSaving]);

  return {
    handleSelectTheme,
    openThemeEditorAdd,
    openThemeEditorEdit,
    handleThemeEditorSave,
    handleThemeEditorClose,
    handleDuplicateCustomTheme,
    handleDeleteCustomTheme,
    handleBackgroundModeChange,
    handleBackgroundImageFile,
    handleDeleteBackgroundImage,
    handleSave,
  };
}
