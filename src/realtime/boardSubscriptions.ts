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
  // Filter by columnId to ensure we only get cards from columns in this board
  // Since cards don't have boardId directly, we'll filter in the handler
  return subscribeToChanges(
    topic,
    [
      {
        event: 'INSERT',
        table: 'cards',
        handler: (payload: RealtimePostgresChangesPayload<DbRecord>) => {
          logRealtime(topic, 'card insert', payload.new);
          // Verify the card belongs to a column in this board
          // The channel routing should ensure this, but double-check for safety
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
  console.log(`[Realtime] Subscribing to board members channel: ${topic}`);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'boardSubscriptions.ts:97',message:'subscribeBoardMembers called',data:{boardId,topic,filter:`boardId=eq.${boardId}`},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  // Use camelCase to match Prisma model field names
  const filter = `boardId=eq.${boardId}`;

  return subscribeToChanges(
    topic,
    [
      {
        event: 'UPDATE',
        table: 'boardMembers',
        filter,
        handler: (payload: RealtimePostgresChangesPayload<DbRecord>) => {
          logRealtime(topic, 'member update', { id: payload.new?.id });
          handlers.onUpdate?.(payload.new || {}, payload.old || {});
        },
      },
      {
        event: 'DELETE',
        table: 'boardMembers',
        filter,
        handler: (payload: RealtimePostgresChangesPayload<DbRecord>) => {
          logRealtime(topic, 'member delete', payload.old);
          handlers.onDelete?.(payload.old || {});
        },
      },
      {
        event: 'INSERT',
        table: 'boardMembers',
        filter,
        handler: (payload: RealtimePostgresChangesPayload<DbRecord>) => {
          logRealtime(topic, 'member insert', payload.new);
          handlers.onInsert?.(payload.new || {});
        },
      },
    ]
  );
}

