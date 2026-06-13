import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../utils/api.js';

export interface AdminReportingBoardNameFilterControls {
  readonly boardFilterId: string | null;
  readonly boardFilterLabel: string | null;
  readonly boardOptions: readonly { readonly value: string; readonly label: string }[];
  readonly loadingBoardOptions: boolean;
  readonly handleBoardFilterSelect: (boardId: string) => void;
  readonly clearBoardFilter: () => void;
}

export function useAdminReportingBoardNameFilter(): AdminReportingBoardNameFilterControls {
  const [boardFilterId, setBoardFilterId] = useState<string | null>(null);
  const [boardOptions, setBoardOptions] = useState<
    readonly { readonly value: string; readonly label: string }[]
  >([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void api
      .getAdminReportingBoardOptions()
      .then((response) => {
        if (cancelled) {
          return;
        }
        const options = response.boards.map((board) => ({
          value: board.id,
          label: board.name,
        }));
        setBoardOptions(options);
      })
      .catch(() => {
        if (!cancelled) {
          setBoardOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingOptions(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const boardFilterLabel = useMemo(() => {
    if (boardFilterId == null) {
      return null;
    }
    return boardOptions.find((option) => option.value === boardFilterId)?.label ?? null;
  }, [boardFilterId, boardOptions]);

  const handleBoardFilterSelect = useCallback((boardId: string): void => {
    setBoardFilterId(boardId);
  }, []);

  const clearBoardFilter = useCallback((): void => {
    setBoardFilterId(null);
  }, []);

  return {
    boardFilterId,
    boardFilterLabel,
    boardOptions,
    loadingBoardOptions: loadingOptions,
    handleBoardFilterSelect,
    clearBoardFilter,
  };
}
