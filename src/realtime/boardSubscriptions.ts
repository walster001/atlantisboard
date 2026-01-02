import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { logRealtime } from './logger';
import { subscribeToChanges, SubscriptionCleanup } from './realtimeClient';

type DbRecord = Record<string, unknown>;

type CardHandlers = {
  onInsert?: (card: DbRecord) => void;
  onUpdate?: (card: DbRecord, previous: DbRecord) => void;
  onDelete?: (card: DbRecord) => void;
};

type ColumnHandlers = {
  onInsert?: (column: DbRecord) => void;
  onUpdate?: (column: DbRecord, previous: DbRecord) => void;
  onDelete?: (column: DbRecord) => void;
};

type MemberHandlers = {
  onUpdate?: (membership: DbRecord, previous: DbRecord) => void;
  onDelete?: (membership: DbRecord) => void;
  onInsert?: (membership: DbRecord) => void;
};

export function subscribeBoardCards(boardId: string, handlers: CardHandlers): SubscriptionCleanup {
  const topic = `board-${boardId}-cards`;
  return subscribeToChanges(
    topic,
    [
      {
        event: 'INSERT',
        table: 'cards',
        handler: (payload: RealtimePostgresChangesPayload<DbRecord>) => {
          logRealtime(topic, 'card insert', payload.new);
          handlers.onInsert?.(payload.new || {});
        },
      },
      {
        event: 'UPDATE',
        table: 'cards',
        handler: (payload: RealtimePostgresChangesPayload<DbRecord>) => {
          logRealtime(topic, 'card update', { id: payload.new?.id });
          handlers.onUpdate?.(payload.new || {}, payload.old || {});
        },
      },
      {
        event: 'DELETE',
        table: 'cards',
        handler: (payload: RealtimePostgresChangesPayload<DbRecord>) => {
          logRealtime(topic, 'card delete', payload.old);
          handlers.onDelete?.(payload.old || {});
        },
      },
    ]
  );
}

export function subscribeBoardColumns(boardId: string, handlers: ColumnHandlers): SubscriptionCleanup {
  const topic = `board-${boardId}-columns`;
  // Use camelCase to match Prisma model field names
  const filter = `boardId=eq.${boardId}`;

  return subscribeToChanges(
    topic,
    [
      {
        event: 'INSERT',
        table: 'columns',
        filter,
        handler: (payload: RealtimePostgresChangesPayload<DbRecord>) => {
          logRealtime(topic, 'column insert', payload.new);
          handlers.onInsert?.(payload.new || {});
        },
      },
      {
        event: 'UPDATE',
        table: 'columns',
        filter,
        handler: (payload: RealtimePostgresChangesPayload<DbRecord>) => {
          logRealtime(topic, 'column update', { id: payload.new?.id });
          handlers.onUpdate?.(payload.new || {}, payload.old || {});
        },
      },
      {
        event: 'DELETE',
        table: 'columns',
        filter,
        handler: (payload: RealtimePostgresChangesPayload<DbRecord>) => {
          logRealtime(topic, 'column delete', payload.old);
          handlers.onDelete?.(payload.old || {});
        },
      },
    ]
  );
}

export function subscribeBoardMembers(boardId: string, handlers: MemberHandlers): SubscriptionCleanup {
  const topic = `board-${boardId}-members`;
  // Use camelCase to match Prisma model field names
  const filter = `boardId=eq.${boardId}`;

  return subscribeToChanges(
    topic,
    [
      {
        event: 'UPDATE',
        table: 'board_members',
        filter,
        handler: (payload: RealtimePostgresChangesPayload<DbRecord>) => {
          logRealtime(topic, 'member update', { id: payload.new?.id });
          handlers.onUpdate?.(payload.new || {}, payload.old || {});
        },
      },
      {
        event: 'DELETE',
        table: 'board_members',
        filter,
        handler: (payload: RealtimePostgresChangesPayload<DbRecord>) => {
          logRealtime(topic, 'member delete', payload.old);
          handlers.onDelete?.(payload.old || {});
        },
      },
      {
        event: 'INSERT',
        table: 'board_members',
        filter,
        handler: (payload: RealtimePostgresChangesPayload<DbRecord>) => {
          logRealtime(topic, 'member insert', payload.new);
          handlers.onInsert?.(payload.new || {});
        },
      },
    ]
  );
}

