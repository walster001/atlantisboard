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
  const filter = `user_id=eq.${userId}`;

  return subscribeToChanges(
    topic,
    [
      {
        event: 'INSERT',
        table: 'board_members',
        filter,
        handler: (payload) => {
          logRealtime(topic, 'board membership insert', { board_id: payload.new?.board_id });
          handlers.onAdded?.(payload);
        },
      },
      {
        event: 'DELETE',
        table: 'board_members',
        filter,
        handler: (payload) => {
          logRealtime(topic, 'board membership delete', { board_id: payload.old?.board_id });
          handlers.onRemoved?.(payload);
        },
      },
    ]
  );
}

