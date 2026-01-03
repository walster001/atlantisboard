import { subscribeToChanges, SubscriptionCleanup, RealtimePostgresChangesPayload } from './realtimeClient';
import { logRealtime } from './logger';
import { getSubscriptionRegistry } from './subscriptionRegistry';

/**
 * Workspace event handlers for parent-child hierarchy model
 */
export type WorkspaceHandlers = {
  onBoardUpdate?: (board: Record<string, unknown>, event: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onColumnUpdate?: (column: Record<string, unknown>, event: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onCardUpdate?: (card: Record<string, unknown>, event: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onCardDetailUpdate?: (detail: Record<string, unknown>, event: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onMemberUpdate?: (member: Record<string, unknown>, event: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onWorkspaceUpdate?: (workspace: Record<string, unknown>, event: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onInviteUpdate?: (invite: Record<string, unknown>, event: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
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
          const board = payload.new as { workspaceId?: string };
          if (board?.workspaceId === workspaceId) {
            logRealtime(topic, 'board insert', payload.new);
            handlers.onBoardUpdate?.(payload.new || {}, payload);
          }
        },
      },
      {
        event: 'UPDATE',
        table: 'boards',
        handler: (payload) => {
          const board = payload.new as { workspaceId?: string; id?: string };
          const oldBoard = payload.old as { workspaceId?: string; id?: string };
          const oldWorkspaceId = oldBoard?.workspaceId;
          const newWorkspaceId = board?.workspaceId;
          
          // Process if board belongs to this workspace (new workspaceId)
          if (board?.workspaceId === workspaceId) {
            logRealtime(topic, 'board update', { id: board.id });
            handlers.onBoardUpdate?.(payload.new || {}, payload);
            // Parent update - refresh all children
            if (board.id) {
              handlers.onParentRefresh?.('board', board.id);
            }
          }
          // Also process if board was moved FROM this workspace (old workspaceId)
          // This allows the old workspace to remove the board from its list
          else if (oldWorkspaceId === workspaceId && newWorkspaceId !== workspaceId) {
            logRealtime(topic, 'board moved from workspace', { 
              id: board.id, 
              from: oldWorkspaceId, 
              to: newWorkspaceId 
            });
            // Pass old board data so Home.tsx can remove it
            handlers.onBoardUpdate?.(payload.old || {}, payload);
          }
        },
      },
      {
        event: 'DELETE',
        table: 'boards',
        handler: (payload) => {
          const board = payload.old as { workspaceId?: string };
          if (board?.workspaceId === workspaceId) {
            logRealtime(topic, 'board delete', payload.old);
            handlers.onBoardUpdate?.(payload.old || {}, payload);
          }
        },
      },
      {
        event: 'INSERT',
        table: 'columns',
        handler: (payload) => {
          // Check if column belongs to a board in this workspace
          const column = payload.new as { boardId?: string };
          if (column?.boardId) {
            // Verify board is in this workspace (will be filtered by event router)
            logRealtime(topic, 'column insert', payload.new);
            handlers.onColumnUpdate?.(payload.new || {}, payload);
          }
        },
      },
      {
        event: 'UPDATE',
        table: 'columns',
        handler: (payload) => {
          const column = payload.new as { boardId?: string; id?: string };
          if (column?.boardId) {
            logRealtime(topic, 'column update', { id: column.id });
            handlers.onColumnUpdate?.(payload.new || {}, payload);
          }
        },
      },
      {
        event: 'DELETE',
        table: 'columns',
        handler: (payload) => {
          const column = payload.old as { boardId?: string };
          if (column?.boardId) {
            logRealtime(topic, 'column delete', payload.old);
            handlers.onColumnUpdate?.(payload.old || {}, payload);
          }
        },
      },
      {
        event: 'INSERT',
        table: 'cards',
        handler: (payload) => {
          logRealtime(topic, 'card insert', payload.new);
          handlers.onCardUpdate?.(payload.new || {}, payload);
        },
      },
      {
        event: 'UPDATE',
        table: 'cards',
        handler: (payload) => {
          logRealtime(topic, 'card update', { id: payload.new?.id });
          handlers.onCardUpdate?.(payload.new || {}, payload);
        },
      },
      {
        event: 'DELETE',
        table: 'cards',
        handler: (payload) => {
          logRealtime(topic, 'card delete', payload.old);
          handlers.onCardUpdate?.(payload.old || {}, payload);
        },
      },
      {
        event: 'INSERT',
        table: 'boardMembers',
        handler: (payload) => {
          logRealtime(topic, 'member insert', payload.new);
          handlers.onMemberUpdate?.(payload.new || {}, payload);
        },
      },
      {
        event: 'UPDATE',
        table: 'boardMembers',
        handler: (payload) => {
          logRealtime(topic, 'member update', { id: payload.new?.userId });
          handlers.onMemberUpdate?.(payload.new || {}, payload);
        },
      },
      {
        event: 'DELETE',
        table: 'boardMembers',
        handler: (payload) => {
          logRealtime(topic, 'member delete', payload.old);
          handlers.onMemberUpdate?.(payload.old || {}, payload);
        },
      },
      // Card detail tables (attachments, subtasks, assignees, labels)
      {
        event: 'INSERT',
        table: 'card_attachments',
        handler: (payload) => {
          logRealtime(topic, 'card attachment insert', payload.new);
          handlers.onCardDetailUpdate?.(payload.new || {}, payload);
        },
      },
      {
        event: 'UPDATE',
        table: 'card_attachments',
        handler: (payload) => {
          logRealtime(topic, 'card attachment update', { id: payload.new?.id });
          handlers.onCardDetailUpdate?.(payload.new || {}, payload);
        },
      },
      {
        event: 'DELETE',
        table: 'card_attachments',
        handler: (payload) => {
          logRealtime(topic, 'card attachment delete', payload.old);
          handlers.onCardDetailUpdate?.(payload.old || {}, payload);
        },
      },
      {
        event: 'INSERT',
        table: 'card_subtasks',
        handler: (payload) => {
          logRealtime(topic, 'card subtask insert', payload.new);
          handlers.onCardDetailUpdate?.(payload.new || {}, payload);
        },
      },
      {
        event: 'UPDATE',
        table: 'card_subtasks',
        handler: (payload) => {
          logRealtime(topic, 'card subtask update', { id: payload.new?.id });
          handlers.onCardDetailUpdate?.(payload.new || {}, payload);
        },
      },
      {
        event: 'DELETE',
        table: 'card_subtasks',
        handler: (payload) => {
          logRealtime(topic, 'card subtask delete', payload.old);
          handlers.onCardDetailUpdate?.(payload.old || {}, payload);
        },
      },
      {
        event: 'INSERT',
        table: 'card_assignees',
        handler: (payload) => {
          logRealtime(topic, 'card assignee insert', payload.new);
          handlers.onCardDetailUpdate?.(payload.new || {}, payload);
        },
      },
      {
        event: 'DELETE',
        table: 'card_assignees',
        handler: (payload) => {
          logRealtime(topic, 'card assignee delete', payload.old);
          handlers.onCardDetailUpdate?.(payload.old || {}, payload);
        },
      },
      {
        event: 'INSERT',
        table: 'card_labels',
        handler: (payload) => {
          logRealtime(topic, 'card label insert', payload.new);
          handlers.onCardDetailUpdate?.(payload.new || {}, payload);
        },
      },
      {
        event: 'DELETE',
        table: 'card_labels',
        handler: (payload) => {
          logRealtime(topic, 'card label delete', payload.old);
          handlers.onCardDetailUpdate?.(payload.old || {}, payload);
        },
      },
      // Workspace membership changes
      {
        event: 'INSERT',
        table: 'workspaceMembers',
        handler: (payload) => {
          const membership = payload.new as { workspaceId?: string };
          if (membership?.workspaceId === workspaceId) {
            logRealtime(topic, 'workspace membership insert', payload.new);
            handlers.onWorkspaceUpdate?.(payload.new || {}, payload);
          }
        },
      },
      {
        event: 'DELETE',
        table: 'workspaceMembers',
        handler: (payload) => {
          const membership = payload.old as { workspaceId?: string };
          if (membership?.workspaceId === workspaceId) {
            logRealtime(topic, 'workspace membership delete', payload.old);
            handlers.onWorkspaceUpdate?.(payload.old || {}, payload);
          }
        },
      },
      // Workspace entity changes
      {
        event: 'INSERT',
        table: 'workspaces',
        handler: (payload) => {
          const workspace = payload.new as { id?: string };
          if (workspace?.id === workspaceId) {
            logRealtime(topic, 'workspace insert', payload.new);
            handlers.onWorkspaceUpdate?.(payload.new || {}, payload);
          }
        },
      },
      {
        event: 'UPDATE',
        table: 'workspaces',
        handler: (payload) => {
          const workspace = payload.new as { id?: string };
          if (workspace?.id === workspaceId) {
            logRealtime(topic, 'workspace update', { id: workspace.id });
            handlers.onWorkspaceUpdate?.(payload.new || {}, payload);
          }
        },
      },
      {
        event: 'DELETE',
        table: 'workspaces',
        handler: (payload) => {
          const workspace = payload.old as { id?: string };
          if (workspace?.id === workspaceId) {
            logRealtime(topic, 'workspace delete', payload.old);
            handlers.onWorkspaceUpdate?.(payload.old || {}, payload);
          }
        },
      },
      // Invite token changes
      {
        event: 'INSERT',
        table: 'board_invite_tokens',
        handler: (payload) => {
          const invite = payload.new as { boardId?: string };
          if (invite?.boardId) {
            // Verify board is in this workspace (will be filtered by event router)
            logRealtime(topic, 'invite token insert', payload.new);
            handlers.onInviteUpdate?.(payload.new || {}, payload);
          }
        },
      },
      {
        event: 'DELETE',
        table: 'board_invite_tokens',
        handler: (payload) => {
          const invite = payload.old as { boardId?: string };
          if (invite?.boardId) {
            logRealtime(topic, 'invite token delete', payload.old);
            handlers.onInviteUpdate?.(payload.old || {}, payload);
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
 */
export function subscribeAllWorkspacesViaRegistry(
  workspaceIds: string[],
  handlers: WorkspaceHandlers
): void {
  const registry = getSubscriptionRegistry();
  workspaceIds.forEach((workspaceId) => {
    registry.subscribeWorkspace(workspaceId, handlers);
  });
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

