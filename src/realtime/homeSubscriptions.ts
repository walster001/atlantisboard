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

