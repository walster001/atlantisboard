import { api } from '@/integrations/api/client';
import { logRealtime } from './logger';
import type { RealtimePostgresChangesPayload, PostgresChangeHandler } from '@/integrations/api/realtime';

// Use API client's realtime
const realtimeApi = {
  channel: (topic: string) => api.realtime.channel(topic),
  removeChannel: (channel: { topic: string } | string) => api.realtime.removeChannel(channel),
};

type RealtimeChannelState = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

interface RealtimeChannel {
  topic: string;
  state: RealtimeChannelState;
  on: (
    event: 'postgres_changes',
    config: {
      event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
      schema?: string;
      table: string;
      filter?: string;
    },
    handler: PostgresChangeHandler
  ) => RealtimeChannel;
  subscribe: (callback?: (status: RealtimeChannelState, error?: Error) => void) => RealtimeChannel;
  unsubscribe: () => RealtimeChannel;
}

interface PostgresChangeBinding {
  event: RealtimePostgresChangesPayload['eventType'] | '*';
  schema?: string;
  table: string;
  filter?: string;
  handler: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
}

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
  const channel = realtimeApi.channel(topic);

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
    realtimeApi.removeChannel(channel);
  };
}

