import { useEffect, useMemo, useState } from 'react';
import {
  loadBoardMemberUsersForDisplay,
  type BoardMemberUserDisplay,
} from '../utils/loadBoardMemberUsersForDisplay.js';

/**
 * Map of user id → display fields for kanban card assignee chips (board + workspace scope).
 */
export function useBoardAssigneeDirectory(boardId: string): ReadonlyMap<string, BoardMemberUserDisplay> {
  const [members, setMembers] = useState<BoardMemberUserDisplay[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const rows = await loadBoardMemberUsersForDisplay(boardId, ac.signal);
        if (!ac.signal.aborted) {
          setMembers(rows);
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
