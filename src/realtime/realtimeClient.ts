import { api } from '@/integrations/api/client';
import { logRealtime } from './logger';

// Use API client's realtime instead of Supabase
const supabase = {
  channel: (topic: string) => api.realtime.channel(topic),
  removeChannel: (channel: any) => api.realtime.removeChannel(channel),
};

// Type compatibility
type RealtimeChannel = {
  topic: string;
  state: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';
  on: (event: 'postgres_changes', config: any, handler: any) => RealtimeChannel;
  subscribe: (callback?: (status: any, error?: Error) => void) => RealtimeChannel;
  unsubscribe: () => RealtimeChannel;
};

type RealtimePostgresChangesPayload<T = Record<string, unknown>> = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T | null;
  old: T | null;
  errors?: string[];
};

type PostgresChangeBinding = {
  event: RealtimePostgresChangesPayload['eventType'] | '*';
  schema?: string;
  table: string;
  filter?: string;
  handler: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
};

export type SubscriptionCleanup = () => void;

/**
 * Subscribe to one or more Postgres change bindings on a named channel.
 * Returns a cleanup function that removes the channel.
 */
export function subscribeToChanges(
  topic: string,
  bindings: PostgresChangeBinding[],
  onStatus?: (status: RealtimeChannel['state'], error?: Error) => void
): SubscriptionCleanup {
  // Ensure setAuth token is available before creating channel
  // The channel will use the token when the websocket connects
  const channel = supabase.channel(topic);

  bindings.forEach((binding) => {
    channel.on(
      'postgres_changes',
      {
        event: binding.event,
        schema: binding.schema ?? 'public',
        table: binding.table,
        ...(binding.filter ? { filter: binding.filter } : {}),
      },
      binding.handler
    );
  });

  channel.subscribe((status, error) => {
    if (status === 'CHANNEL_ERROR' || error) {
      console.error(`[realtime:${topic}] ${status}`, { error: error?.message });
    }
    logRealtime(topic, `status:${status}`, error ? { error: error.message } : undefined);
    onStatus?.(status, error ?? undefined);
  });

  return () => {
    logRealtime(topic, 'cleanup');
    supabase.removeChannel(channel);
  };
}

