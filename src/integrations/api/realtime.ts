/**
 * Realtime Client - Supabase-compatible WebSocket client
 * 
 * Provides a Supabase Realtime API-compatible interface for WebSocket connections.
 */

const isDev = import.meta.env.DEV;

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
  private messageQueue: Map<string, any[]> = new Map(); // Queue messages for channels not yet registered
  private pendingUnsubscribes: Set<string> = new Set(); // Track channels pending unsubscribe
  private serverRestoredChannels: Set<string> = new Set(); // Track channels restored by server on reconnect

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

  /**
   * Ensure connection is established (doesn't reconnect if already connected)
   */
  ensureConnected(): void {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return; // Already connecting or connected
    }
    
    if (!this.accessToken) {
      return; // No token, cannot connect (will be initialized via realtimeManager)
    }
    
    this.connect();
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
      if (isDev) console.log('[Realtime] Connected');
      this.reconnectAttempts = 0;
      this.serverRestoredChannels.clear(); // Reset on new connection
      
      // Wait a short time for server to send restored channel notifications
      // Then subscribe only to channels not restored by server
      setTimeout(() => {
        this.channels.forEach((channelState) => {
          // Only subscribe if server didn't already restore this channel
          if (!this.serverRestoredChannels.has(channelState.topic)) {
            this.subscribeToChannel(channelState);
          }
        });
        // Clear restored channels set after resubscription check
        this.serverRestoredChannels.clear();
      }, 100);

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
      if (isDev) console.log('[Realtime] Disconnected');
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
    
    if (isDev) console.log(`[Realtime] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
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
        if (isDev) console.log('[Realtime] Connection confirmed');
      } else if (message.payload?.type === 'pong') {
        // Heartbeat response
      } else if (message.payload?.type === 'subscribed') {
        const channelState = this.channels.get(message.payload.channel);
        if (channelState) {
          channelState.state = 'SUBSCRIBED';
          channelState.onStatus?.('SUBSCRIBED');
        }
        // Track server-restored channels to prevent duplicate subscriptions
        this.serverRestoredChannels.add(message.payload.channel);
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
      if (!channelState) {
        // Check if channel is workspace channel and use prefix matching only for workspace channels
        if (message.channel.startsWith('workspace:')) {
          const workspacePrefix = message.channel.split(':')[0] + ':';
          const matchingChannel = Array.from(this.channels.keys()).find(ch => 
            ch.startsWith(workspacePrefix) && (message.channel.startsWith(ch) || ch.startsWith(message.channel))
          );
          if (matchingChannel) {
            const matchedState = this.channels.get(matchingChannel);
            if (matchedState) {
              // Process with the matched channel state
              this.processEventForChannel(matchedState, message);
              return;
            }
          }
        }
        
        // Queue message if channel not found (might be registered soon)
        // Only queue if channel looks like a workspace/board channel (not system messages)
        if (message.channel && !message.channel.startsWith('system')) {
          const queue = this.messageQueue.get(message.channel) || [];
          if (queue.length < 50) { // Limit queue size
            queue.push(message);
            this.messageQueue.set(message.channel, queue);
          } else {
            console.warn(`[Realtime] Message queue full for channel: ${message.channel}, dropping message`);
          }
        } else {
          console.warn(`[Realtime] No channel state found for channel: ${message.channel}. Available channels: ${Array.from(this.channels.keys()).join(', ')}`);
        }
        return;
      }
      
      this.processEventForChannel(channelState, message);
      return;
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

  private processEventForChannel(channelState: ChannelState, message: any): void {
    // Find matching bindings
    channelState.bindings.forEach((binding, index) => {
      const tableMatches = binding.table === message.table ||
        (binding.table === 'boardMembers' && message.table === 'board_members') ||
        (binding.table === 'board_members' && message.table === 'boardMembers') ||
        (binding.table === 'workspaceMembers' && message.table === 'workspace_members') ||
        (binding.table === 'workspace_members' && message.table === 'workspaceMembers');

      const eventMatches = binding.event === '*' || binding.event === message.event;

      if (tableMatches && eventMatches) {
        // Apply filter if present
        if (binding.filter) {
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

  private matchesFilter(record: Record<string, unknown> | null, filter: string): boolean {
    if (!record) {
      return false;
    }

    // Simple filter parser: "field=eq.value" or "field=neq.value"
    const match = filter.match(/^(\w+)=(eq|neq)\.(.+)$/);
    if (!match) {
      return true; // If filter is malformed, allow through
    }

    const [, field, operator, value] = match;
    
    // Prisma models use camelCase, but support both formats for backwards compatibility
    // Convert snake_case to camelCase: board_id -> boardId
    const camelCaseField = field.includes('_') 
      ? field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
      : null;
    // Convert camelCase to snake_case: boardId -> board_id (for backwards compatibility)
    const snakeCaseField = !field.includes('_') && /[A-Z]/.test(field)
      ? field.replace(/([A-Z])/g, '_$1').toLowerCase()
      : null;
    
    // Try camelCase first (Prisma format), then snake_case (backwards compatibility)
    const recordValue = record[field] 
      ?? (camelCaseField ? record[camelCaseField] : undefined)
      ?? (snakeCaseField ? record[snakeCaseField] : undefined);

    if (operator === 'eq') {
      const matches = String(recordValue) === value;
      return matches;
    } else if (operator === 'neq') {
      const matches = String(recordValue) !== value;
      return matches;
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

    // Check if channel already exists and merge bindings if needed
    const existingChannel = this.channels.get(topic);
    if (existingChannel) {
      console.warn(`[Realtime] Channel ${topic} already exists, merging bindings`);
      // Merge bindings (avoid duplicates)
      const existingBindingKeys = new Set(existingChannel.bindings.map(b => `${b.table}:${b.event}`));
      bindings.forEach(binding => {
        const key = `${binding.table}:${binding.event}`;
        if (!existingBindingKeys.has(key)) {
          existingChannel.bindings.push(binding);
        }
      });
      // Update onStatus callback if provided
      if (onStatus) {
        existingChannel.onStatus = onStatus;
      }
    } else {
      this.channels.set(topic, channelState);
      if (isDev) console.log(`[Realtime] Added channel ${topic} to map. Total channels: ${this.channels.size}`);
    }

    // Ensure connection is established (doesn't reconnect if already connected)
    this.ensureConnected();
    
    // If WebSocket is open, subscribe immediately
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const channelToSubscribe = existingChannel || channelState;
      this.subscribeToChannel(channelToSubscribe);
    }
    // If WebSocket is CONNECTING, the onopen handler will subscribe to all channels
    // No additional action needed here - the channel is already in this.channels
  }

  removeChannel(topic: string): void {
    this.unsubscribeFromChannel(topic);
    // Mark as pending unsubscribe - will be removed after unsubscribe confirmation
    this.pendingUnsubscribes.add(topic);
    // Clear any queued messages for this channel
    this.messageQueue.delete(topic);
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
    this.serverRestoredChannels.clear();
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

