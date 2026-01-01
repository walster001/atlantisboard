/**
 * Realtime Client - Supabase-compatible WebSocket client
 * 
 * Provides a Supabase Realtime API-compatible interface for WebSocket connections.
 */

type RealtimeChannelState = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

interface RealtimePostgresChangesPayload<T = Record<string, unknown>> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T | null;
  old: T | null;
  errors?: string[];
}

type PostgresChangeHandler<T = Record<string, unknown>> = (
  payload: RealtimePostgresChangesPayload<T>
) => void;

interface PostgresChangeBinding {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema?: string;
  table: string;
  filter?: string;
  handler: PostgresChangeHandler;
}

interface ChannelSubscription {
  unsubscribe: () => void;
}

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
  subscribe: (
    callback?: (status: RealtimeChannelState, error?: Error) => void
  ) => RealtimeChannel;
  unsubscribe: () => RealtimeChannel;
}

class RealtimeClient {
  private ws: WebSocket | null = null;
  private channels: Map<string, ChannelState> = new Map();
  private accessToken: string | null = null;
  private wsUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(baseUrl: string) {
    // Convert HTTP URL to WebSocket URL
    const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
    const wsHost = baseUrl.replace(/^https?:\/\//, '').replace(/\/api$/, '');
    this.wsUrl = `${wsProtocol}://${wsHost}/realtime`;
  }

  setAuth(token: string | null) {
    this.accessToken = token;
    
    // If WebSocket is connected, reconnect with new token
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.disconnect();
      this.connect();
    }
  }

  private connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return; // Already connecting or connected
    }

    if (!this.accessToken) {
      console.warn('[Realtime] No access token, cannot connect');
      return;
    }

    const url = `${this.wsUrl}?token=${encodeURIComponent(this.accessToken)}`;
    
    try {
      this.ws = new WebSocket(url);
      this.setupWebSocketHandlers();
    } catch (error) {
      console.error('[Realtime] Connection error:', error);
      this.scheduleReconnect();
    }
  }

  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log('[Realtime] Connected');
      this.reconnectAttempts = 0;
      
      // Resubscribe to all channels
      this.channels.forEach((channelState) => {
        this.subscribeToChannel(channelState);
      });

      // Start heartbeat
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('[Realtime] Error parsing message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[Realtime] WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('[Realtime] Disconnected');
      this.stopHeartbeat();
      
      // Reconnect if not intentionally closed
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    
    console.log(`[Realtime] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 30000); // 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(message: any): void {
    // Handle system messages
    if (message.channel === 'system') {
      if (message.payload?.type === 'connected') {
        console.log('[Realtime] Connection confirmed');
      } else if (message.payload?.type === 'pong') {
        // Heartbeat response
      } else if (message.payload?.type === 'subscribed') {
        const channelState = this.channels.get(message.payload.channel);
        if (channelState) {
          channelState.state = 'SUBSCRIBED';
          channelState.onStatus?.('SUBSCRIBED');
        }
      } else if (message.payload?.type === 'unsubscribed') {
        const channelState = this.channels.get(message.payload.channel);
        if (channelState) {
          channelState.state = 'CLOSED';
          channelState.onStatus?.('CLOSED');
        }
      }
      return;
    }

    // Handle database change events
    if (message.event === 'INSERT' || message.event === 'UPDATE' || message.event === 'DELETE') {
      const channelState = this.channels.get(message.channel);
      if (channelState) {
        // Find matching bindings
        channelState.bindings.forEach((binding) => {
          if (
            binding.table === message.table &&
            (binding.event === '*' || binding.event === message.event)
          ) {
            // Apply filter if present
            if (binding.filter) {
              // Simple filter matching (e.g., "board_id=eq.123")
              const filterMatch = this.matchesFilter(message.payload.new || message.payload.old, binding.filter);
              if (!filterMatch) {
                return;
              }
            }

            // Call handler
            binding.handler({
              eventType: message.event,
              new: message.payload.new || null,
              old: message.payload.old || null,
            });
          }
        });
      }
    }

    // Handle custom events (e.g., board.removed)
    if (message.event === 'CUSTOM') {
      const channelState = this.channels.get(message.channel);
      if (channelState) {
        // Custom events can be handled by bindings if needed
        // For now, we'll pass them through as postgres_changes if table is provided
        if (message.table) {
          channelState.bindings.forEach((binding) => {
            if (binding.table === message.table) {
              binding.handler({
                eventType: 'UPDATE', // Custom events as updates
                new: message.payload,
                old: null,
              });
            }
          });
        }
      }
    }
  }

  private matchesFilter(record: Record<string, unknown> | null, filter: string): boolean {
    if (!record) return false;

    // Simple filter parser: "field=eq.value" or "field=neq.value"
    const match = filter.match(/^(\w+)=(eq|neq)\.(.+)$/);
    if (!match) return true; // If filter is malformed, allow through

    const [, field, operator, value] = match;
    const recordValue = record[field];

    if (operator === 'eq') {
      return String(recordValue) === value;
    } else if (operator === 'neq') {
      return String(recordValue) !== value;
    }

    return true;
  }

  channel(topic: string): RealtimeChannel {
    return new RealtimeChannelImpl(topic, this);
  }

  private subscribeToChannel(channelState: ChannelState): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        type: 'subscribe',
        channel: channelState.topic,
      });
    }
  }

  private unsubscribeFromChannel(topic: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        type: 'unsubscribe',
        channel: topic,
      });
    }
  }

  addChannel(topic: string, bindings: PostgresChangeBinding[], onStatus?: (status: RealtimeChannelState, error?: Error) => void): void {
    const channelState: ChannelState = {
      topic,
      bindings,
      state: 'CLOSED',
      onStatus,
    };

    this.channels.set(topic, channelState);

    // Connect if not already connected
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.connect();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.subscribeToChannel(channelState);
    }
  }

  removeChannel(topic: string): void {
    this.unsubscribeFromChannel(topic);
    this.channels.delete(topic);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.channels.clear();
  }
}

interface ChannelState {
  topic: string;
  bindings: PostgresChangeBinding[];
  state: RealtimeChannelState;
  onStatus?: (status: RealtimeChannelState, error?: Error) => void;
}

class RealtimeChannelImpl implements RealtimeChannel {
  public topic: string;
  private client: RealtimeClient;
  private bindings: PostgresChangeBinding[] = [];
  private onStatusCallback?: (status: RealtimeChannelState, error?: Error) => void;
  public state: RealtimeChannelState = 'CLOSED';

  constructor(topic: string, client: RealtimeClient) {
    this.topic = topic;
    this.client = client;
  }

  on(
    event: 'postgres_changes',
    config: {
      event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
      schema?: string;
      table: string;
      filter?: string;
    },
    handler: PostgresChangeHandler
  ): RealtimeChannel {
    this.bindings.push({
      event: config.event,
      schema: config.schema,
      table: config.table,
      filter: config.filter,
      handler,
    });
    return this;
  }

  subscribe(callback?: (status: RealtimeChannelState, error?: Error) => void): RealtimeChannel {
    this.onStatusCallback = callback;
    this.client.addChannel(this.topic, this.bindings, (status, error) => {
      this.state = status;
      callback?.(status, error);
    });
    return this;
  }

  unsubscribe(): RealtimeChannel {
    this.client.removeChannel(this.topic);
    this.state = 'CLOSED';
    return this;
  }

}

// Export singleton instance
let realtimeClient: RealtimeClient | null = null;

export function getRealtimeClient(baseUrl: string): RealtimeClient {
  if (!realtimeClient) {
    realtimeClient = new RealtimeClient(baseUrl);
  }
  return realtimeClient;
}

// Re-export for compatibility with Supabase client shape
export { RealtimeClient };

export type { RealtimeChannel, RealtimePostgresChangesPayload, PostgresChangeHandler };

