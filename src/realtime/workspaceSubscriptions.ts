import { subscribeToChanges, SubscriptionCleanup, RealtimePostgresChangesPayload } from './realtimeClient';
import { logRealtime } from './logger';
import { getSubscriptionRegistry } from './subscriptionRegistry';
import type {
  BoardResponse,
  ColumnResponse,
  CardResponse,
  BoardMemberResponse,
  WorkspaceResponse,
  WorkspaceMemberResponse,
  InviteTokenResponse,
  CardAttachmentResponse,
  CardSubtaskResponse,
  CardLabelResponse,
  CardAssigneeResponse,
} from '@/types/api';

// Union type for card detail entities
type CardDetailEntity = CardAttachmentResponse | CardSubtaskResponse | CardLabelResponse | CardAssigneeResponse;

/**
 * Workspace event handlers for parent-child hierarchy model
 */
export type WorkspaceHandlers = {
  onBoardUpdate?: (board: BoardResponse, event: RealtimePostgresChangesPayload<BoardResponse>) => void;
  onColumnUpdate?: (column: ColumnResponse, event: RealtimePostgresChangesPayload<ColumnResponse>) => void;
  onCardUpdate?: (card: CardResponse, event: RealtimePostgresChangesPayload<CardResponse>) => void;
  onCardDetailUpdate?: (detail: CardDetailEntity, event: RealtimePostgresChangesPayload<CardDetailEntity>) => void;
  onMemberUpdate?: (member: BoardMemberResponse, event: RealtimePostgresChangesPayload<BoardMemberResponse>) => void;
  onWorkspaceUpdate?: (workspace: WorkspaceResponse | WorkspaceMemberResponse, event: RealtimePostgresChangesPayload<WorkspaceResponse | WorkspaceMemberResponse>) => void;
  onInviteUpdate?: (invite: InviteTokenResponse, event: RealtimePostgresChangesPayload<InviteTokenResponse>) => void;
  // When parent (board) updates, refresh all children
  onParentRefresh?: (parentType: 'board', parentId: string) => void;
};

/**
 * Subscribe to a single workspace channel
 * Receives all child updates (boards, columns, cards, members) through workspace
 */
export function subscribeWorkspace(
  workspaceId: string,
  handlers: WorkspaceHandlers
): SubscriptionCleanup {
  const topic = `workspace:${workspaceId}`;

  return subscribeToChanges(
    topic,
    [
      {
        event: 'INSERT',
        table: 'boards',
        handler: (payload) => {
          if (!payload.new) {
            logRealtime(topic, 'board insert skipped - no data', {});
            return;
          }
          const board = payload.new as unknown as BoardResponse | null;
          if (board?.workspaceId === workspaceId) {
            logRealtime(topic, 'board insert', payload.new);
            handlers.onBoardUpdate?.(board, payload as unknown as RealtimePostgresChangesPayload<BoardResponse>);
          }
        },
      },
      {
        event: 'UPDATE',
        table: 'boards',
        handler: (payload) => {
          if (!payload.new && !payload.old) {
            logRealtime(topic, 'board update skipped - no data', {});
            return;
          }
          const board = payload.new as { workspaceId?: string; id?: string } | null;
          const oldBoard = payload.old as { workspaceId?: string; id?: string } | null;
          const oldWorkspaceId = oldBoard?.workspaceId;
          const newWorkspaceId = board?.workspaceId;
          
          // Process if board belongs to this workspace (new workspaceId)
          if (board && board.workspaceId === workspaceId) {
            logRealtime(topic, 'board update', { id: board.id });
            handlers.onBoardUpdate?.(payload.new as unknown as BoardResponse, payload as unknown as RealtimePostgresChangesPayload<BoardResponse>);
            // Parent update - refresh all children
            if (board.id) {
              handlers.onParentRefresh?.('board', board.id);
            }
          }
          // Also process if board was moved FROM this workspace (old workspaceId)
          // This allows the old workspace to remove the board from its list
          else if (oldWorkspaceId === workspaceId && newWorkspaceId !== workspaceId) {
            logRealtime(topic, 'board moved from workspace', { 
              id: board?.id || oldBoard?.id, 
              from: oldWorkspaceId, 
              to: newWorkspaceId 
            });
            // Pass old board data so Home.tsx can remove it
            const boardToRemove = (payload.old || {}) as unknown as BoardResponse;
            handlers.onBoardUpdate?.(boardToRemove, payload as unknown as RealtimePostgresChangesPayload<BoardResponse>);
          }
        },
      },
      {
        event: 'DELETE',
        table: 'boards',
        handler: (payload) => {
          if (!payload.old) {
            logRealtime(topic, 'board delete skipped - no data', {});
            return;
          }
          const board = payload.old as { workspaceId?: string };
          if (board?.workspaceId === workspaceId) {
            logRealtime(topic, 'board delete', payload.old);
            const oldBoard = payload.old as unknown as BoardResponse;
            handlers.onBoardUpdate?.(oldBoard, payload as unknown as RealtimePostgresChangesPayload<BoardResponse>);
          }
        },
      },
      {
        event: 'INSERT',
        table: 'columns',
        handler: (payload) => {
          if (!payload.new) {
            logRealtime(topic, 'column insert skipped - no data', {});
            return;
          }
          // Check if column belongs to a board in this workspace
          const column = payload.new as { boardId?: string };
          if (column?.boardId) {
            // Verify board is in this workspace (will be filtered by event router)
            logRealtime(topic, 'column insert', payload.new);
            handlers.onColumnUpdate?.(payload.new as unknown as ColumnResponse, payload as unknown as RealtimePostgresChangesPayload<ColumnResponse>);
          }
        },
      },
      {
        event: 'UPDATE',
        table: 'columns',
        handler: (payload) => {
          if (!payload.new && !payload.old) {
            logRealtime(topic, 'column update skipped - no data', {});
            return;
          }
          const column = payload.new as { boardId?: string; id?: string } | null;
          if (column?.boardId) {
            logRealtime(topic, 'column update', { id: column.id });
            handlers.onColumnUpdate?.(payload.new as unknown as ColumnResponse, payload as unknown as RealtimePostgresChangesPayload<ColumnResponse>);
          }
        },
      },
      {
        event: 'DELETE',
        table: 'columns',
        handler: (payload) => {
          if (!payload.old) {
            logRealtime(topic, 'column delete skipped - no data', {});
            return;
          }
          const column = payload.old as { boardId?: string };
          if (column?.boardId) {
            logRealtime(topic, 'column delete', payload.old);
            handlers.onColumnUpdate?.(payload.old as unknown as ColumnResponse, payload as unknown as RealtimePostgresChangesPayload<ColumnResponse>);
          }
        },
      },
      {
        event: 'INSERT',
        table: 'cards',
        handler: (payload) => {
          if (!payload.new) {
            logRealtime(topic, 'card insert skipped - no data', {});
            return;
          }
          logRealtime(topic, 'card insert', payload.new);
          handlers.onCardUpdate?.(payload.new as unknown as CardResponse, payload as unknown as RealtimePostgresChangesPayload<CardResponse>);
        },
      },
      {
        event: 'UPDATE',
        table: 'cards',
        handler: (payload) => {
          if (!payload.new && !payload.old) {
            logRealtime(topic, 'card update skipped - no data', {});
            return;
          }
          logRealtime(topic, 'card update', { id: payload.new?.id });
          handlers.onCardUpdate?.(payload.new as unknown as CardResponse, payload as unknown as RealtimePostgresChangesPayload<CardResponse>);
        },
      },
      {
        event: 'DELETE',
        table: 'cards',
        handler: (payload) => {
          if (!payload.old) {
            logRealtime(topic, 'card delete skipped - no data', {});
            return;
          }
          logRealtime(topic, 'card delete', payload.old);
          handlers.onCardUpdate?.(payload.old as unknown as CardResponse, payload as unknown as RealtimePostgresChangesPayload<CardResponse>);
        },
      },
      {
        event: 'INSERT',
        table: 'boardMembers',
        handler: (payload) => {
          if (!payload.new) {
            logRealtime(topic, 'member insert skipped - no data', {});
            return;
          }
          logRealtime(topic, 'member insert', payload.new);
          handlers.onMemberUpdate?.(payload.new as unknown as BoardMemberResponse, payload as unknown as RealtimePostgresChangesPayload<BoardMemberResponse>);
        },
      },
      {
        event: 'UPDATE',
        table: 'boardMembers',
        handler: (payload) => {
          if (!payload.new && !payload.old) {
            logRealtime(topic, 'member update skipped - no data', {});
            return;
          }
          logRealtime(topic, 'member update', { id: payload.new?.userId });
          handlers.onMemberUpdate?.(payload.new as unknown as BoardMemberResponse, payload as unknown as RealtimePostgresChangesPayload<BoardMemberResponse>);
        },
      },
      {
        event: 'DELETE',
        table: 'boardMembers',
        handler: (payload) => {
          if (!payload.old) {
            logRealtime(topic, 'member delete skipped - no data', {});
            return;
          }
          logRealtime(topic, 'member delete', payload.old);
          handlers.onMemberUpdate?.(payload.old as unknown as BoardMemberResponse, payload as unknown as RealtimePostgresChangesPayload<BoardMemberResponse>);
        },
      },
      // Card detail tables (attachments, subtasks, assignees, labels)
      {
        event: 'INSERT',
        table: 'card_attachments',
        handler: (payload) => {
          if (!payload.new) {
            logRealtime(topic, 'card attachment insert skipped - no data', {});
            return;
          }
          logRealtime(topic, 'card attachment insert', payload.new);
          handlers.onCardDetailUpdate?.(payload.new as unknown as CardDetailEntity, payload as unknown as RealtimePostgresChangesPayload<CardDetailEntity>);
        },
      },
      {
        event: 'UPDATE',
        table: 'card_attachments',
        handler: (payload) => {
          if (!payload.new && !payload.old) {
            logRealtime(topic, 'card attachment update skipped - no data', {});
            return;
          }
          logRealtime(topic, 'card attachment update', { id: payload.new?.id });
          handlers.onCardDetailUpdate?.(payload.new as unknown as CardDetailEntity, payload as unknown as RealtimePostgresChangesPayload<CardDetailEntity>);
        },
      },
      {
        event: 'DELETE',
        table: 'card_attachments',
        handler: (payload) => {
          if (!payload.old) {
            logRealtime(topic, 'card attachment delete skipped - no data', {});
            return;
          }
          logRealtime(topic, 'card attachment delete', payload.old);
          handlers.onCardDetailUpdate?.(payload.old as unknown as CardDetailEntity, payload as unknown as RealtimePostgresChangesPayload<CardDetailEntity>);
        },
      },
      {
        event: 'INSERT',
        table: 'card_subtasks',
        handler: (payload) => {
          if (!payload.new) {
            logRealtime(topic, 'card subtask insert skipped - no data', {});
            return;
          }
          logRealtime(topic, 'card subtask insert', payload.new);
          handlers.onCardDetailUpdate?.(payload.new as unknown as CardDetailEntity, payload as unknown as RealtimePostgresChangesPayload<CardDetailEntity>);
        },
      },
      {
        event: 'UPDATE',
        table: 'card_subtasks',
        handler: (payload) => {
          if (!payload.new && !payload.old) {
            logRealtime(topic, 'card subtask update skipped - no data', {});
            return;
          }
          logRealtime(topic, 'card subtask update', { id: payload.new?.id });
          handlers.onCardDetailUpdate?.(payload.new as unknown as CardDetailEntity, payload as unknown as RealtimePostgresChangesPayload<CardDetailEntity>);
        },
      },
      {
        event: 'DELETE',
        table: 'card_subtasks',
        handler: (payload) => {
          if (!payload.old) {
            logRealtime(topic, 'card subtask delete skipped - no data', {});
            return;
          }
          logRealtime(topic, 'card subtask delete', payload.old);
          handlers.onCardDetailUpdate?.(payload.old as unknown as CardDetailEntity, payload as unknown as RealtimePostgresChangesPayload<CardDetailEntity>);
        },
      },
      {
        event: 'INSERT',
        table: 'card_assignees',
        handler: (payload) => {
          if (!payload.new) {
            logRealtime(topic, 'card assignee insert skipped - no data', {});
            return;
          }
          logRealtime(topic, 'card assignee insert', payload.new);
          handlers.onCardDetailUpdate?.(payload.new as unknown as CardDetailEntity, payload as unknown as RealtimePostgresChangesPayload<CardDetailEntity>);
        },
      },
      {
        event: 'DELETE',
        table: 'card_assignees',
        handler: (payload) => {
          if (!payload.old) {
            logRealtime(topic, 'card assignee delete skipped - no data', {});
            return;
          }
          logRealtime(topic, 'card assignee delete', payload.old);
          handlers.onCardDetailUpdate?.(payload.old as unknown as CardDetailEntity, payload as unknown as RealtimePostgresChangesPayload<CardDetailEntity>);
        },
      },
      {
        event: 'INSERT',
        table: 'card_labels',
        handler: (payload) => {
          if (!payload.new) {
            logRealtime(topic, 'card label insert skipped - no data', {});
            return;
          }
          logRealtime(topic, 'card label insert', payload.new);
          handlers.onCardDetailUpdate?.(payload.new as unknown as CardDetailEntity, payload as unknown as RealtimePostgresChangesPayload<CardDetailEntity>);
        },
      },
      {
        event: 'DELETE',
        table: 'card_labels',
        handler: (payload) => {
          if (!payload.old) {
            logRealtime(topic, 'card label delete skipped - no data', {});
            return;
          }
          logRealtime(topic, 'card label delete', payload.old);
          handlers.onCardDetailUpdate?.(payload.old as unknown as CardDetailEntity, payload as unknown as RealtimePostgresChangesPayload<CardDetailEntity>);
        },
      },
      // Workspace membership changes
      {
        event: 'INSERT',
        table: 'workspaceMembers',
        handler: (payload) => {
          if (!payload.new) {
            logRealtime(topic, 'workspace membership insert skipped - no data', {});
            return;
          }
          const membership = payload.new as { workspaceId?: string };
          if (membership?.workspaceId === workspaceId) {
            logRealtime(topic, 'workspace membership insert', payload.new);
            handlers.onWorkspaceUpdate?.(payload.new as unknown as WorkspaceResponse | WorkspaceMemberResponse, payload as unknown as RealtimePostgresChangesPayload<WorkspaceResponse | WorkspaceMemberResponse>);
          }
        },
      },
      {
        event: 'DELETE',
        table: 'workspaceMembers',
        handler: (payload) => {
          if (!payload.old) {
            logRealtime(topic, 'workspace membership delete skipped - no data', {});
            return;
          }
          const membership = payload.old as { workspaceId?: string };
          if (membership?.workspaceId === workspaceId) {
            logRealtime(topic, 'workspace membership delete', payload.old);
            handlers.onWorkspaceUpdate?.(payload.old as unknown as WorkspaceResponse | WorkspaceMemberResponse, payload as unknown as RealtimePostgresChangesPayload<WorkspaceResponse | WorkspaceMemberResponse>);
          }
        },
      },
      // Workspace entity changes
      {
        event: 'INSERT',
        table: 'workspaces',
        handler: (payload) => {
          if (!payload.new) {
            logRealtime(topic, 'workspace insert skipped - no data', {});
            return;
          }
          const workspace = payload.new as { id?: string };
          if (workspace?.id === workspaceId) {
            logRealtime(topic, 'workspace insert', payload.new);
            handlers.onWorkspaceUpdate?.(payload.new as unknown as WorkspaceResponse | WorkspaceMemberResponse, payload as unknown as RealtimePostgresChangesPayload<WorkspaceResponse | WorkspaceMemberResponse>);
          }
        },
      },
      {
        event: 'UPDATE',
        table: 'workspaces',
        handler: (payload) => {
          if (!payload.new && !payload.old) {
            logRealtime(topic, 'workspace update skipped - no data', {});
            return;
          }
          const workspace = payload.new as { id?: string };
          if (workspace?.id === workspaceId) {
            logRealtime(topic, 'workspace update', { id: workspace.id });
            handlers.onWorkspaceUpdate?.(payload.new as unknown as WorkspaceResponse | WorkspaceMemberResponse, payload as unknown as RealtimePostgresChangesPayload<WorkspaceResponse | WorkspaceMemberResponse>);
          }
        },
      },
      {
        event: 'DELETE',
        table: 'workspaces',
        handler: (payload) => {
          if (!payload.old) {
            logRealtime(topic, 'workspace delete skipped - no data', {});
            return;
          }
          const workspace = payload.old as { id?: string };
          if (workspace?.id === workspaceId) {
            logRealtime(topic, 'workspace delete', payload.old);
            handlers.onWorkspaceUpdate?.(payload.old as unknown as WorkspaceResponse | WorkspaceMemberResponse, payload as unknown as RealtimePostgresChangesPayload<WorkspaceResponse | WorkspaceMemberResponse>);
          }
        },
      },
      // Invite token changes
      {
        event: 'INSERT',
        table: 'board_invite_tokens',
        handler: (payload) => {
          if (!payload.new) {
            logRealtime(topic, 'invite token insert skipped - no data', {});
            return;
          }
          const invite = payload.new as { boardId?: string };
          if (invite?.boardId) {
            // Verify board is in this workspace (will be filtered by event router)
            logRealtime(topic, 'invite token insert', payload.new);
            handlers.onInviteUpdate?.(payload.new as unknown as InviteTokenResponse, payload as unknown as RealtimePostgresChangesPayload<InviteTokenResponse>);
          }
        },
      },
      {
        event: 'DELETE',
        table: 'board_invite_tokens',
        handler: (payload) => {
          if (!payload.old) {
            logRealtime(topic, 'invite token delete skipped - no data', {});
            return;
          }
          const invite = payload.old as { boardId?: string };
          if (invite?.boardId) {
            logRealtime(topic, 'invite token delete', payload.old);
            handlers.onInviteUpdate?.(payload.old as unknown as InviteTokenResponse, payload as unknown as RealtimePostgresChangesPayload<InviteTokenResponse>);
          }
        },
      },
    ]
  );
}

/**
 * Subscribe to all workspaces a user has access to
 * Automatically subscribes to new workspaces when user is added
 * 
 * Note: This function should be called with workspaceIds array from the component
 * that has already fetched the user's workspaces. For dynamic subscription management,
 * use subscribeWorkspace for individual workspaces.
 */
export function subscribeAllWorkspaces(
  workspaceIds: string[],
  handlers: WorkspaceHandlers
): SubscriptionCleanup {
  if (workspaceIds.length === 0) {
    return () => {}; // No workspaces, return no-op cleanup
  }

  const subscriptions: SubscriptionCleanup[] = [];

  // Subscribe to each workspace
  workspaceIds.forEach((workspaceId) => {
    const cleanup = subscribeWorkspace(workspaceId, handlers);
    subscriptions.push(cleanup);
  });

  // Return cleanup function that unsubscribes from all
  return () => {
    subscriptions.forEach((cleanup) => cleanup());
  };
}

/**
 * Subscribe to all workspaces via subscription registry
 * Subscriptions persist across navigation and component unmounts
 * Only unsubscribes on explicit logout or workspace access revocation
 * Returns cleanup function to remove handlers when dependencies change
 */
export function subscribeAllWorkspacesViaRegistry(
  workspaceIds: string[],
  handlers: WorkspaceHandlers
): SubscriptionCleanup {
  const registry = getSubscriptionRegistry();
  const cleanupFunctions: SubscriptionCleanup[] = [];
  
  workspaceIds.forEach((workspaceId) => {
    const cleanup = registry.subscribeWorkspace(workspaceId, handlers);
    cleanupFunctions.push(cleanup);
  });

  // Return cleanup function that removes all handlers
  return () => {
    cleanupFunctions.forEach(cleanup => cleanup());
  };
}

/**
 * Subscribe to a workspace via subscription registry
 * Subscription persists across navigation and component unmounts
 * Only unsubscribes on explicit logout or workspace access revocation
 * Returns cleanup function to remove handlers when component unmounts (prevents memory leaks)
 */
export function subscribeWorkspaceViaRegistry(
  workspaceId: string,
  handlers: WorkspaceHandlers
): SubscriptionCleanup {
  const registry = getSubscriptionRegistry();
  return registry.subscribeWorkspace(workspaceId, handlers);
}

