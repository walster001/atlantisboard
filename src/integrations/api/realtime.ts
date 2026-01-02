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
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'realtime.ts:103',message:'WebSocket OPEN - resubscribing channels',data:{channelCount:this.channels.size,channels:Array.from(this.channels.keys())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'realtime.ts:178',message:'handleMessage entry',data:{hasChannel:!!message.channel,channel:message.channel,event:message.event,table:message.table,hasPayload:!!message.payload},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
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
      console.log('[Realtime] Received event:', {
        channel: message.channel,
        event: message.event,
        table: message.table,
        hasPayload: !!message.payload,
        hasNew: !!message.payload?.new,
        hasOld: !!message.payload?.old,
      });

      const channelState = this.channels.get(message.channel);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'realtime.ts:212',message:'channel state lookup',data:{channel:message.channel,hasChannelState:!!channelState,state:channelState?.state,bindingCount:channelState?.bindings.length,totalChannels:this.channels.size,allChannels:Array.from(this.channels.keys())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      if (!channelState) {
        console.warn(`[Realtime] No channel state found for channel: ${message.channel}. Available channels: ${Array.from(this.channels.keys()).join(', ')}`);
        // Try to find a matching channel by prefix (for workspace channels that might have been recreated)
        const matchingChannel = Array.from(this.channels.keys()).find(ch => 
          message.channel.startsWith(ch) || ch.startsWith(message.channel)
        );
        if (matchingChannel) {
          console.log(`[Realtime] Found matching channel: ${matchingChannel} for ${message.channel}`);
          const matchedState = this.channels.get(matchingChannel);
          if (matchedState) {
            // Process with the matched channel state
            this.processEventForChannel(matchedState, message);
            return;
          }
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
    console.log(`[Realtime] Channel state found: ${message.channel}, state: ${channelState.state}, bindings: ${channelState.bindings.length}`);

    // Find matching bindings
    channelState.bindings.forEach((binding, index) => {
      const tableMatches = binding.table === message.table ||
        (binding.table === 'boardMembers' && message.table === 'board_members') ||
        (binding.table === 'board_members' && message.table === 'boardMembers') ||
        (binding.table === 'workspaceMembers' && message.table === 'workspace_members') ||
        (binding.table === 'workspace_members' && message.table === 'workspaceMembers');

      const eventMatches = binding.event === '*' || binding.event === message.event;

      console.log(`[Realtime] Binding ${index}: table=${binding.table}, event=${binding.event}, tableMatches=${tableMatches}, eventMatches=${eventMatches}`);

      if (tableMatches && eventMatches) {
        // Apply filter if present
        if (binding.filter) {
          const filterMatch = this.matchesFilter(message.payload.new || message.payload.old, binding.filter);
          console.log(`[Realtime] Filter check: filter=${binding.filter}, match=${filterMatch}`);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'realtime.ts:234',message:'filter check',data:{channel:message.channel,bindingIndex:index,filter:binding.filter,filterMatch,table:message.table,event:message.event},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          if (!filterMatch) {
            console.log(`[Realtime] Filter rejected event`);
            return;
          }
        }

        console.log(`[Realtime] Calling handler for binding ${index}`);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'realtime.ts:243',message:'calling handler',data:{channel:message.channel,bindingIndex:index,table:message.table,event:message.event,hasNew:!!message.payload?.new,hasOld:!!message.payload?.old},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
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
      console.log(`[Realtime] Filter match failed: record is null for filter ${filter}`);
      return false;
    }

    // Simple filter parser: "field=eq.value" or "field=neq.value"
    const match = filter.match(/^(\w+)=(eq|neq)\.(.+)$/);
    if (!match) {
      console.log(`[Realtime] Filter malformed, allowing through: ${filter}`);
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

    console.log(`[Realtime] Filter check: field=${field}, operator=${operator}, value=${value}, recordValue=${recordValue}, camelCaseField=${camelCaseField}, snakeCaseField=${snakeCaseField}`);

    if (operator === 'eq') {
      const matches = String(recordValue) === value;
      console.log(`[Realtime] Filter eq result: ${matches} (${String(recordValue)} === ${value})`);
      return matches;
    } else if (operator === 'neq') {
      const matches = String(recordValue) !== value;
      console.log(`[Realtime] Filter neq result: ${matches} (${String(recordValue)} !== ${value})`);
      return matches;
    }

    return true;
  }

  channel(topic: string): RealtimeChannel {
    return new RealtimeChannelImpl(topic, this);
  }

  private subscribeToChannel(channelState: ChannelState): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'realtime.ts:336',message:'sending SUBSCRIBE message',data:{channel:channelState.topic,wsReadyState:this.ws.readyState},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      this.send({
        type: 'subscribe',
        channel: channelState.topic,
      });
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'realtime.ts:336',message:'SUBSCRIBE skipped - WS not open',data:{channel:channelState.topic,wsReadyState:this.ws?.readyState},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'realtime.ts:342',message:'addChannel called',data:{topic,bindingCount:bindings.length,bindings:bindings.map(b=>({table:b.table,event:b.event,filter:b.filter})),wsReadyState:this.ws?.readyState,existingChannels:Array.from(this.channels.keys())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
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
      console.log(`[Realtime] Added channel ${topic} to map. Total channels: ${this.channels.size}`);
    }

    // Connect if not already connected
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.connect();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      // WebSocket is open, subscribe immediately
      const channelToSubscribe = existingChannel || channelState;
      this.subscribeToChannel(channelToSubscribe);
    }
    // If WebSocket is CONNECTING, the onopen handler will subscribe to all channels
    // No additional action needed here - the channel is already in this.channels
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

