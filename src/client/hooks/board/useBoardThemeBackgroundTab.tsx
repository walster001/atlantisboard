import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '../../contexts/AuthContext.js';
import { useBoardThemes } from '../../hooks/useBoardThemes.js';
import {
  createDefaultBoardThemeSettings,
  resolveBoardBackgroundFromThemeSettings,
  type BoardThemeDefinition,
  type BoardThemeSettings,
} from '../../../shared/boardTheme.js';
import { toThemeCardItems } from '../../components/board/boardThemeTabHelpers.js';
import { loadBoardThemeState } from './boardThemeBackgroundActions.js';
import { useBoardThemeBackgroundTabHandlers } from './boardThemeBackgroundTabHandlers.js';

export type ThemeNav = 'theme' | 'background';

export interface UseBoardThemeBackgroundTabOptions {
  readonly boardId: string;
  readonly canChangeTheme: boolean;
  readonly canManageCustomThemes: boolean;
  readonly onThemeLivePatch?: (patch: { themeSettings: BoardThemeSettings; background?: string }) => void;
  readonly initialNav?: ThemeNav;
}

export function useBoardThemeBackgroundTab({
  boardId,
  canChangeTheme,
  canManageCustomThemes,
  onThemeLivePatch,
  initialNav,
}: UseBoardThemeBackgroundTabOptions) {
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

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);
        const loaded = await loadBoardThemeState(boardId, catalog);
        if (!cancelled) {
          setAppCustomThemes(loaded.appCustomThemes);
          setSavedSettings(loaded.savedSettings);
          setDraft(loaded.savedSettings);
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
  }, [boardId, catalog]);

  const patchLive = useCallback(
    (settings: BoardThemeSettings) => {
      const background = resolveBoardBackgroundFromThemeSettings(settings);
      onThemeLivePatch?.({
        themeSettings: settings,
        ...(background !== undefined ? { background } : {}),
      });
    },
    [onThemeLivePatch],
  );

  const handlers = useBoardThemeBackgroundTabHandlers({
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
  });

  const hasUnsavedChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(savedSettings), [draft, savedSettings]);
  const themeCards = useMemo(() => toThemeCardItems(draft, systemThemes), [draft, systemThemes]);
  const previewBackground = resolveBoardBackgroundFromThemeSettings(draft);
  const previewIsImage = previewBackground != null && /^(https?:|data:|\/)/i.test(previewBackground);
  const hasBackgroundImage = (draft.backgroundImageUrl?.trim() ?? '') !== '';

  return {
    loading,
    saving,
    uploadingImage,
    error,
    draft,
    setDraft,
    nav,
    setNav,
    savedSettings,
    systemThemes,
    themeEditorOpen,
    themeEditorVariant,
    themeEditorInitial,
    themeEditorSaving,
    themeEditorError,
    hasUnsavedChanges,
    themeCards,
    previewBackground,
    previewIsImage,
    hasBackgroundImage,
    ...handlers,
  };
}
