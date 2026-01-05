/**
 * Workspace Event Router
 * 
 * Routes workspace events to appropriate handlers based on entityType and current view context.
 * Filters events by boardId when viewing a specific board.
 */

import { RealtimePostgresChangesPayload } from './realtimeClient';

interface WorkspaceEventPayload extends RealtimePostgresChangesPayload<Record<string, unknown>> {
  entityType?: 'board' | 'column' | 'card' | 'cardDetail' | 'member' | 'workspace';
  entityId?: string;
  parentId?: string;
  workspaceId?: string;
}

interface EventRouterContext {
  currentBoardId?: string;
  currentWorkspaceId?: string;
  workspaceIds?: string[]; // For home page - filter by user's workspaces
}

/**
 * Route workspace events to appropriate handlers
 * Filters events based on context (board page vs home page)
 */
export function routeWorkspaceEvent(
  payload: WorkspaceEventPayload,
  context: EventRouterContext,
  handlers: {
    onBoard?: (board: Record<string, unknown>, event: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
    onColumn?: (column: Record<string, unknown>, event: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
    onCard?: (card: Record<string, unknown>, event: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
    onCardDetail?: (detail: Record<string, unknown>, event: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
    onMember?: (member: Record<string, unknown>, event: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
    onWorkspace?: (workspace: Record<string, unknown>, event: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
    onParentRefresh?: (parentType: 'board', parentId: string) => void;
  }
): boolean {
  const { entityType, workspaceId } = payload;
  const record = payload.new || payload.old;

  if (!record) {
    return false;
  }

  // Filter by workspace - only process events for workspaces in context
  if (workspaceId) {
    if (context.currentWorkspaceId && workspaceId !== context.currentWorkspaceId) {
      return false; // Different workspace, skip
    }
    if (context.workspaceIds && !context.workspaceIds.includes(workspaceId)) {
      return false; // Not in user's workspaces, skip
    }
  }

  // Route based on entity type
  switch (entityType) {
    case 'board': {
      const board = record as { id?: string; workspaceId?: string };
      // For board page: only process if it's the current board
      if (context.currentBoardId && board.id !== context.currentBoardId) {
        return false;
      }
      // For home page: process all boards in user's workspaces
      handlers.onBoard?.(record, payload);
      // If board is updated, trigger parent refresh
      if (payload.eventType === 'UPDATE' && board.id) {
        handlers.onParentRefresh?.('board', board.id);
      }
      return true;
    }

    case 'column': {
      const column = record as { id?: string; boardId?: string };
      // For board page: only process if column belongs to current board
      if (context.currentBoardId && column.boardId !== context.currentBoardId) {
        return false;
      }
      handlers.onColumn?.(record, payload);
      return true;
    }

    case 'card': {
      // For board page: need to check if card's column belongs to current board
      // This requires column lookup, so we'll filter in the handler
      // For now, process all cards and let the handler filter
      handlers.onCard?.(record, payload);
      return true;
    }

    case 'cardDetail': {
      // Card details are filtered by cardId, which will be checked in handlers
      handlers.onCardDetail?.(record, payload);
      return true;
    }

    case 'member': {
      const member = record as { boardId?: string; userId?: string };
      // For board page: only process if member belongs to current board
      if (context.currentBoardId && member.boardId !== context.currentBoardId) {
        return false;
      }
      handlers.onMember?.(record, payload);
      return true;
    }

    case 'workspace': {
      handlers.onWorkspace?.(record, payload);
      return true;
    }

    default:
      // Unknown entity type, skip
      return false;
  }
}

/**
 * Helper to check if a card belongs to a specific board
 * This requires column lookup, so it's async
 */
export async function cardBelongsToBoard(
  _cardId: string,
  _boardId: string
): Promise<boolean> {
  // This would require an API call to check card's column's boardId
  // For now, we'll rely on the backend to only emit events for cards in the workspace
  // and filter on the frontend using column state
  return true; // Placeholder - will be implemented with actual lookup if needed
}

