import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';
import { useSocket } from '../../hooks/useSocket.js';
import type { BoardDB, BoardSettingsLivePatch, CardDB } from '../../store/database.js';
import { db } from '../../store/database.js';
import { useBoardRuntimeStore } from '../../store/boardRuntimeStore.js';
import { releaseBoardClientResources } from '../../utils/boardMemoryRelease.js';
import { bootstrapBoardRuntimeFromApi, resyncBoardRuntimeFromApi } from '../../store/boardBootstrap.js';
import type { BoardThemeSettings } from '../../../shared/boardTheme.js';
import { primeCardDetailWindow } from '../../components/card/BoardCardDetailOverlay.js';
import { buildKanbanBoardEditCaps } from '../../hooks/kanbanBoardEditCaps.js';
import { useBoardPermissions } from '../../hooks/useBoardPermissions.js';
import { resolveBoardSettingsGate } from '../../utils/boardSettingsPermissions.js';
import { getBoardPageThemeStyle } from '../../utils/boardThemeStyle.js';
import type { ScaleMode } from '../../components/board/scaleModePolicy.js';

interface UseBoardPageControllerParams {
  readonly boardId: string | undefined;
  readonly forcedScaleMode: ScaleMode | '';
  readonly overlayCardId: string | null;
  readonly setSearchParams: SetURLSearchParams;
}

export interface BoardPageController {
  readonly board: BoardDB | null;
  readonly loading: boolean;
  readonly loadFailed: boolean;
  readonly showSettings: boolean;
  readonly showInvites: boolean;
  readonly permissionsLoaded: boolean;
  readonly can: ReturnType<typeof useBoardPermissions>['can'];
  readonly canOpenSettings: boolean;
  readonly canManageCustomThemes: boolean;
  readonly allowedSettingsTabs: readonly ('board' | 'users' | 'theme' | 'audit')[];
  readonly kanbanCaps: ReturnType<typeof buildKanbanBoardEditCaps>;
  readonly boardThemeStyle: ReturnType<typeof getBoardPageThemeStyle> | undefined;
  readonly overlayInitialCardForId: CardDB | undefined;
  readonly boardCardPatchRef: MutableRefObject<((card: CardDB) => void) | null>;
  readonly handleOpenInvites: () => void;
  readonly handleOpenSettings: () => void;
  readonly handleCloseSettings: () => void;
  readonly handleCloseInvites: () => void;
  readonly handleSettingsLivePatch: (patch: BoardSettingsLivePatch) => void;
  readonly handleThemeLivePatch: (patch: { themeSettings: BoardThemeSettings; background?: string }) => void;
  readonly handleOpenCard: (card: CardDB) => void;
  readonly handleCloseCardOverlay: () => void;
  readonly handleCardOverlayDuplicated: (appliedToCurrentBoard: boolean) => void;
  readonly handleCardOverlayDeleted: () => void;
  readonly handleCardOverlayUpdated: (card: CardDB) => void;
}

export function useBoardPageController({
  boardId,
  forcedScaleMode,
  overlayCardId,
  setSearchParams,
}: UseBoardPageControllerParams): BoardPageController {
  const board = useBoardRuntimeStore((s) => s.board);
  const workspaceIdForPermissions = board?.workspaceId;
  const latestBoardIdRef = useRef(boardId);
  latestBoardIdRef.current = boardId;
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const [overlayInitialCard, setOverlayInitialCard] = useState<CardDB | null>(null);
  const [cachedThemeBoard, setCachedThemeBoard] = useState<BoardDB | null>(null);
  const boardCardPatchRef = useRef<((card: CardDB) => void) | null>(null);
  const isMountedRef = useRef(true);
  useSocket(boardId);

  const { can, loaded: permissionsLoaded, permissions } = useBoardPermissions(boardId, workspaceIdForPermissions);
  const kanbanCaps = useMemo(
    () => buildKanbanBoardEditCaps(permissionsLoaded, permissions),
    [permissionsLoaded, permissions],
  );
  const boardSettingsGate = useMemo(() => resolveBoardSettingsGate(can), [can]);
  const { canManageBoardSettings, canManageBoardMembers, canChangeTheme, canManageCustomThemes, canOpenSettings } =
    boardSettingsGate;
  const allowedSettingsTabs = useMemo(() => {
    if (!canManageBoardSettings && canManageBoardMembers) {
      return ['users'] as const;
    }
    const tabs: Array<'board' | 'users' | 'theme' | 'audit'> = ['board', 'users', 'audit'];
    if (canChangeTheme) {
      tabs.splice(2, 0, 'theme');
    }
    return tabs;
  }, [canManageBoardSettings, canManageBoardMembers, canChangeTheme]);

  const loadData = useCallback(
    async (options?: { mode?: 'initial' | 'quiet'; signal?: AbortSignal }) => {
      if (!boardId || !isMountedRef.current) return;
      const mode = options?.mode ?? 'quiet';
      const isInitial = mode === 'initial';
      const requestedBoardId = boardId;
      const signal = options?.signal;
      const scaleOptions =
        forcedScaleMode === 'large'
          ? { listLimit: 400, hydrateDescriptions: 'viewport' as const }
          : forcedScaleMode === 'extreme'
            ? { listLimit: 240, hydrateDescriptions: 'viewport' as const }
            : {};

      try {
        const ok = await bootstrapBoardRuntimeFromApi(requestedBoardId, {
          staged: isInitial,
          ...(signal != null ? { signal } : {}),
          ...scaleOptions,
        });

        if (!isMountedRef.current || latestBoardIdRef.current !== requestedBoardId || signal?.aborted === true) {
          return;
        }

        if (isInitial) {
          await import('../../components/board/KanbanView.js');
        }

        if (!ok) {
          setLoadFailed(true);
          useBoardRuntimeStore.getState().clear();
        } else {
          setLoadFailed(false);
        }
      } catch {
        if (signal?.aborted === true) return;
        if (isMountedRef.current && latestBoardIdRef.current === requestedBoardId) {
          setLoadFailed(true);
          useBoardRuntimeStore.getState().clear();
        }
      } finally {
        if (
          isInitial &&
          isMountedRef.current &&
          latestBoardIdRef.current === requestedBoardId &&
          signal?.aborted !== true
        ) {
          setLoading(false);
        }
      }
    },
    [boardId, forcedScaleMode],
  );

  useEffect(() => {
    isMountedRef.current = true;
    if (!boardId) return undefined;
    const ac = new AbortController();
    setLoading(true);
    setLoadFailed(false);
    useBoardRuntimeStore.getState().clear();
    void loadData({ mode: 'initial', signal: ac.signal });
    return () => {
      ac.abort();
      isMountedRef.current = false;
      releaseBoardClientResources(boardId);
      useBoardRuntimeStore.getState().clear();
    };
  }, [boardId, loadData]);

  useEffect(() => {
    if (boardId == null || boardId.trim() === '') {
      setCachedThemeBoard(null);
      return undefined;
    }
    let cancelled = false;
    void db.boards.get(boardId).then((cached) => {
      if (!cancelled && cached != null) {
        setCachedThemeBoard(cached);
      }
    });
    return () => {
      cancelled = true;
      setCachedThemeBoard(null);
    };
  }, [boardId]);

  const handleOpenInvites = useCallback(() => {
    setShowInvites(true);
  }, []);
  const handleOpenSettings = useCallback(() => {
    if (!canOpenSettings) {
      setShowSettings(false);
      return;
    }
    setShowSettings(true);
  }, [canOpenSettings]);
  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
  }, []);
  const handleCloseInvites = useCallback(() => {
    setShowInvites(false);
  }, []);

  const handleSettingsLivePatch = useCallback((patch: BoardSettingsLivePatch) => {
    useBoardRuntimeStore.getState().applyBoardSettingsLivePatch(patch);
  }, []);
  const handleThemeLivePatch = useCallback((patch: { themeSettings: BoardThemeSettings; background?: string }) => {
    const store = useBoardRuntimeStore.getState();
    const current = store.board;
    if (current == null) return;
    store.commitBoard({
      ...current,
      themeSettings: patch.themeSettings,
      ...(patch.background !== undefined ? { background: patch.background } : {}),
    });
  }, []);

  const handleOpenCard = useCallback(
    (card: CardDB) => {
      primeCardDetailWindow(card.id, card);
      setOverlayInitialCard(card);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('card', card.id);
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );
  const handleCloseCardOverlay = useCallback(() => {
    setOverlayInitialCard(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('card');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);
  const handleCardOverlayDuplicated = useCallback((appliedToCurrentBoard: boolean) => {
    if (appliedToCurrentBoard) {
      return;
    }
    const id = board?.id;
    if (id != null) {
      void resyncBoardRuntimeFromApi(id);
    }
  }, [board?.id]);
  const handleCardOverlayDeleted = useCallback(() => {
    if (overlayCardId) {
      useBoardRuntimeStore.getState().removeCard(overlayCardId);
    }
  }, [overlayCardId]);
  const handleCardOverlayUpdated = useCallback((card: CardDB) => {
    boardCardPatchRef.current?.(card);
  }, []);

  const overlayInitialCardForId =
    overlayCardId != null && overlayInitialCard?.id === overlayCardId ? overlayInitialCard : undefined;
  const boardForTheme = board ?? cachedThemeBoard;
  const boardThemeStyle = useMemo(
    () => (boardForTheme != null ? getBoardPageThemeStyle(boardForTheme) : undefined),
    [boardForTheme],
  );

  return {
    board,
    loading,
    loadFailed,
    showSettings,
    showInvites,
    permissionsLoaded,
    can,
    canOpenSettings,
    canManageCustomThemes,
    allowedSettingsTabs,
    kanbanCaps,
    boardThemeStyle,
    overlayInitialCardForId,
    boardCardPatchRef,
    handleOpenInvites,
    handleOpenSettings,
    handleCloseSettings,
    handleCloseInvites,
    handleSettingsLivePatch,
    handleThemeLivePatch,
    handleOpenCard,
    handleCloseCardOverlay,
    handleCardOverlayDuplicated,
    handleCardOverlayDeleted,
    handleCardOverlayUpdated,
  };
}
