import { useEffect, useMemo, useState } from 'react';
import type { BoardThemeDefinition } from '../../shared/boardTheme.js';
import { buildBoardThemeCatalog, type BoardThemeCatalog } from '../../shared/boardThemeCatalog.js';
import { SYSTEM_BOARD_THEME_SEEDS } from '../../shared/boardThemeSeedData.js';
import { api } from '../utils/api.js';

interface UseBoardThemesResult {
  readonly catalog: BoardThemeCatalog;
  readonly systemThemes: readonly BoardThemeDefinition[];
  readonly customThemes: readonly BoardThemeDefinition[];
  readonly allThemes: readonly BoardThemeDefinition[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => void;
}

function fallbackCatalog(): BoardThemeCatalog {
  return buildBoardThemeCatalog({
    systemThemes: SYSTEM_BOARD_THEME_SEEDS,
    customThemes: [],
  });
}

export function useBoardThemes(boardId?: string): UseBoardThemesResult {
  const [catalog, setCatalog] = useState<BoardThemeCatalog>(fallbackCatalog);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.getThemes(boardId);
        if (cancelled) {
          return;
        }
        setCatalog(
          buildBoardThemeCatalog({
            systemThemes:
              response.systemThemes.length > 0 ? response.systemThemes : SYSTEM_BOARD_THEME_SEEDS,
            customThemes: response.customThemes,
          }),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load themes');
          setCatalog(fallbackCatalog());
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
  }, [boardId, reloadToken]);

  const allThemes = useMemo(
    () => [...catalog.systemThemes, ...catalog.customThemes],
    [catalog.customThemes, catalog.systemThemes],
  );

  return {
    catalog,
    systemThemes: catalog.systemThemes,
    customThemes: catalog.customThemes,
    allThemes,
    loading,
    error,
    reload: () => setReloadToken((value) => value + 1),
  };
}
