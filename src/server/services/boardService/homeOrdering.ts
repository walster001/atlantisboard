import { sanitizeAndSaveHomeBoardOrderForWorkspace } from '../homeBoardPreferencesService.js';
import { logAuditEvent } from '../../utils/auditLogger.js';

/**
 * Persists per-user home-page board order within one workspace row.
 * Does not mutate shared `Board.position` or broadcast global order events.
 */
export async function reorderBoardsInHomeScope(
  userId: string,
  workspaceId: string,
  orderedBoardIds: readonly string[],
): Promise<void> {
  const saved = await sanitizeAndSaveHomeBoardOrderForWorkspace(userId, workspaceId, orderedBoardIds);

  logAuditEvent({
    userId,
    action: 'board.reorder.home',
    resourceType: 'board',
    resourceId: saved[0] ?? 'batch',
    metadata: { workspaceId: workspaceId.trim(), count: saved.length, perUser: true },
    timestamp: new Date(),
  });
}
