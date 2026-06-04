import { api } from '../../utils/api.js';

/** Persist per-user board tile order for one workspace row on the home page. */
export async function persistHomeBoardOrderForWorkspace(
  workspaceId: string,
  orderedBoardIds: readonly string[],
): Promise<Record<string, string[]>> {
  const res = await api.updateUserPreferences({
    homeBoardOrderPatch: {
      workspaceId: workspaceId.trim(),
      orderedBoardIds: [...orderedBoardIds],
    },
  });
  const user = (res as { user?: { preferences?: { homeBoardOrderByWorkspace?: Record<string, string[]> } } })
    .user;
  return user?.preferences?.homeBoardOrderByWorkspace ?? {};
}
