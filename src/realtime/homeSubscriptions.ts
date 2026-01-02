import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { subscribeToChanges, SubscriptionCleanup } from './realtimeClient';
import { logRealtime } from './logger';

type DbRecord = Record<string, unknown>;

type HomeHandlers = {
  onAdded?: (payload: RealtimePostgresChangesPayload<DbRecord>) => void;
  onRemoved?: (payload: RealtimePostgresChangesPayload<DbRecord>) => void;
};

export function subscribeHomeBoardMembership(userId: string, handlers: HomeHandlers): SubscriptionCleanup {
  const topic = `user-${userId}-board-membership`;
  const filter = `userId=eq.${userId}`;

  return subscribeToChanges(
    topic,
    [
      {
        event: 'INSERT',
        table: 'boardMembers',
        filter,
        handler: (payload) => {
          logRealtime(topic, 'board membership insert', { boardId: payload.new?.boardId });
          handlers.onAdded?.(payload);
        },
      },
      {
        event: 'DELETE',
        table: 'boardMembers',
        filter,
        handler: (payload) => {
          logRealtime(topic, 'board membership delete', { boardId: payload.old?.boardId });
          handlers.onRemoved?.(payload);
        },
      },
    ]
  );
}

export function subscribeHomeWorkspaceMembership(userId: string, handlers: HomeHandlers): SubscriptionCleanup {
  const topic = `user-${userId}-workspace-membership`;
  const filter = `userId=eq.${userId}`;

  return subscribeToChanges(
    topic,
    [
      {
        event: 'INSERT',
        table: 'workspaceMembers',
        filter,
        handler: (payload) => {
          logRealtime(topic, 'workspace membership insert', { workspaceId: payload.new?.workspaceId });
          handlers.onAdded?.(payload);
        },
      },
      {
        event: 'DELETE',
        table: 'workspaceMembers',
        filter,
        handler: (payload) => {
          logRealtime(topic, 'workspace membership delete', { workspaceId: payload.old?.workspaceId });
          handlers.onRemoved?.(payload);
        },
      },
    ]
  );
}

type BoardHandlers = {
  onInsert?: (payload: RealtimePostgresChangesPayload<DbRecord>) => void;
  onUpdate?: (payload: RealtimePostgresChangesPayload<DbRecord>) => void;
  onDelete?: (payload: RealtimePostgresChangesPayload<DbRecord>) => void;
};

export function subscribeHomeBoards(workspaceIds: string[], handlers: BoardHandlers): SubscriptionCleanup {
  const topic = `home-boards`;
  
  // Subscribe to workspace channels for board changes
  // We'll use workspace channels since boards belong to workspaces
  const subscriptions: SubscriptionCleanup[] = [];
  
  workspaceIds.forEach((workspaceId) => {
    const workspaceTopic = `workspace:${workspaceId}`;
    subscriptions.push(
      subscribeToChanges(
        workspaceTopic,
        [
          {
            event: 'INSERT',
            table: 'boards',
            filter: undefined, // No filter - we'll filter by workspaceId in the handler
            handler: (payload) => {
              const board = payload.new as { workspaceId?: string; id?: string };
              if (board.workspaceId === workspaceId) {
                logRealtime(workspaceTopic, 'board insert', { boardId: board.id, workspaceId });
                handlers.onInsert?.(payload);
              }
            },
          },
          {
            event: 'UPDATE',
            table: 'boards',
            filter: undefined,
            handler: (payload) => {
              const board = payload.new as { workspaceId?: string; id?: string };
              if (board.workspaceId === workspaceId) {
                logRealtime(workspaceTopic, 'board update', { boardId: board.id, workspaceId });
                handlers.onUpdate?.(payload);
              }
            },
          },
          {
            event: 'DELETE',
            table: 'boards',
            filter: undefined,
            handler: (payload) => {
              const board = payload.old as { workspaceId?: string; id?: string };
              if (board.workspaceId === workspaceId) {
                logRealtime(workspaceTopic, 'board delete', { boardId: board.id, workspaceId });
                handlers.onDelete?.(payload);
              }
            },
          },
        ]
      )
    );
  });

  // Return cleanup function that unsubscribes from all
  return () => {
    subscriptions.forEach((cleanup) => cleanup());
  };
}

