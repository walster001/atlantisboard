import { useEffect, useMemo, useState } from 'react';
import {
  loadBoardMemberUsersForDisplay,
  type BoardMemberUserDisplay,
} from '../utils/loadBoardMemberUsersForDisplay.js';
import { useBoardRuntimeStore } from '../store/boardRuntimeStore.js';
import { env } from '../config/env.js';
import { logAssigneeDirectoryMetric } from '../perf/boardPerf.js';

/**
 * Map of user id → display fields for kanban card assignee chips (board + workspace scope).
 */
export function useBoardAssigneeDirectory(boardId: string): ReadonlyMap<string, BoardMemberUserDisplay> {
  const [members, setMembers] = useState<BoardMemberUserDisplay[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    const t0 =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : null;
    let firstLogged = false;
    const runtime = useBoardRuntimeStore.getState();
    const prioritizedUserIds: string[] = [];
    if (runtime.activeBoardId === boardId) {
      const seen = new Set<string>();
      const listIds = runtime.orderedListIds;
      for (let i = 0; i < listIds.length; i += 1) {
        const listId = listIds[i]!;
        const cardIds = runtime.cardIdsByListId[listId] ?? [];
        for (let j = 0; j < cardIds.length; j += 1) {
          const card = runtime.cardsById[cardIds[j]!];
          if (card == null) {
            continue;
          }
          for (const assignee of card.assignees) {
            const uid = assignee.trim();
            if (uid === '' || seen.has(uid)) {
              continue;
            }
            seen.add(uid);
            prioritizedUserIds.push(uid);
          }
        }
      }
    }

    const onPage = (rows: readonly BoardMemberUserDisplay[], phase: 'first-page' | 'full'): void => {
      if (ac.signal.aborted) {
        return;
      }
      setMembers([...rows]);
      if (t0 != null && (!firstLogged || phase === 'full')) {
        const elapsed =
          typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now() - t0
            : 0;
        logAssigneeDirectoryMetric({
          boardId,
          phase,
          userCount: rows.length,
          ms: elapsed,
        });
        if (phase === 'first-page') {
          firstLogged = true;
        }
      }
    };

    void (async () => {
      try {
        const rows = await loadBoardMemberUsersForDisplay(boardId, ac.signal, {
          ...(env.ASSIGNEE_DIRECTORY_LAZY_ENABLED
            ? {
                prioritizedUserIds,
                pageSize: env.ASSIGNEE_DIRECTORY_PAGE_SIZE,
                onPage,
              }
            : {}),
        });
        if (!ac.signal.aborted) {
          if (!env.ASSIGNEE_DIRECTORY_LAZY_ENABLED) {
            setMembers(rows);
          }
          if (t0 != null) {
            const elapsed =
              typeof performance !== 'undefined' && typeof performance.now === 'function'
                ? performance.now() - t0
                : 0;
            logAssigneeDirectoryMetric({
              boardId,
              phase: 'full',
              userCount: rows.length,
              ms: elapsed,
            });
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        if (!ac.signal.aborted) {
          setMembers([]);
        }
      }
    })();
    return () => ac.abort();
  }, [boardId]);

  return useMemo(() => {
    const m = new Map<string, BoardMemberUserDisplay>();
    for (const u of members) {
      m.set(String(u._id), u);
    }
    return m;
  }, [members]);
}
