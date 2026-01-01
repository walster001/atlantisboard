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
  // #region agent log
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  const anonKeyLength = anonKey.length;
  fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'realtimeClient.ts:19',message:'subscribeToChanges entry',data:{topic,bindingCount:bindings.length,anonKeyLength,anonKeyPreview:anonKey.substring(0,50)+'...'},timestamp:Date.now(),sessionId:'debug-session',runId:'run9',hypothesisId:'I,J'})}).catch(()=>{});
  // #endregion
  // Ensure setAuth token is available before creating channel
  // The channel will use the token when the websocket connects
  const channel = supabase.channel(topic);
  // #region agent log
  const realtimeClient = (supabase as any).realtime;
  const accessTokenGetter = (realtimeClient as any)?.accessToken;
  const tokenType = typeof accessTokenGetter;
  // accessToken is a function that returns a Promise - we need to await it to get the actual token
  let tokenValue: string | null = null;
  let tokenPreview = 'null';
  if (typeof accessTokenGetter === 'function') {
    // Try to get the token synchronously if possible, otherwise it's a Promise
    try {
      const result = accessTokenGetter();
      if (result instanceof Promise) {
        tokenPreview = '[Promise - needs await]';
      } else {
        tokenValue = result;
        tokenPreview = tokenValue ? `${String(tokenValue).substring(0, 20)}...` : 'null';
      }
    } catch (e) {
      tokenPreview = '[Error getting token]';
    }
  } else if (accessTokenGetter) {
    tokenValue = accessTokenGetter;
    tokenPreview = tokenValue ? `${String(tokenValue).substring(0, 20)}...` : 'null';
  }
  const socket = (realtimeClient as any)?.socket;
  let socketUrl = socket?.endPointURL?.toString() || socket?.url?.toString() || 'no-socket-yet';
  let apikeyFromSocketUrl = 'unknown';
  let apikeyLengthFromSocket = 0;
  
  if (socketUrl !== 'no-socket-yet') {
    try {
      const urlObj = new URL(socketUrl);
      apikeyFromSocketUrl = urlObj.searchParams.get('apikey') || 'no-apikey-in-url';
      apikeyLengthFromSocket = apikeyFromSocketUrl.length;
    } catch (e) {
      socketUrl = `error-parsing: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  
  const hasSocket = !!socket;
  const socketReadyState = socket?.readyState;
  // Reuse anonKey from line 25
  const isAnonKeyInUrl = apikeyFromSocketUrl === anonKey;
  const isUserTokenInUrl = apikeyLengthFromSocket > 500;
  
  // Log to console for visibility
  console.log(`[realtime:${topic}] Channel created`, {
    hasSocket,
    socketReadyState,
    socketUrl: socketUrl !== 'no-socket-yet' ? socketUrl.substring(0, 100) + '...' : socketUrl,
    apikeyLength: apikeyLengthFromSocket,
    isAnonKey: isAnonKeyInUrl,
    isUserToken: isUserTokenInUrl,
    apikeyPreview: apikeyFromSocketUrl !== 'unknown' && apikeyFromSocketUrl !== 'no-apikey-in-url' ? `${apikeyFromSocketUrl.substring(0, 30)}...` : apikeyFromSocketUrl
  });
  
  fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'realtimeClient.ts:28',message:'Channel created - checking auth and socket',data:{topic,hasAccessTokenGetter:!!accessTokenGetter,accessTokenType:tokenType,accessTokenIsFunction:typeof accessTokenGetter==='function',tokenValueType:typeof tokenValue,tokenValueLength:tokenValue?.length,tokenPreview,hasSocket,socketReadyState,socketUrl:socketUrl.substring(0,200),apikeyFromSocketUrl:apikeyFromSocketUrl!=='unknown'&&apikeyFromSocketUrl!=='no-apikey-in-url'?apikeyFromSocketUrl.substring(0,50)+'...':apikeyFromSocketUrl,apikeyLengthFromSocket,isAnonKeyInUrl,isUserTokenInUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run9',hypothesisId:'I,J'})}).catch(()=>{});
  // #endregion

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
    // #region agent log
    // Capture websocket URL and apikey when channel subscribes
    const realtimeClient = (supabase as any).realtime;
    const socket = (realtimeClient as any)?.socket;
    let websocketUrl = 'unknown';
    let apikeyFromUrl = 'unknown';
    let apikeyLength = 0;
    let isAnonKey = false;
    let isUserToken = false;
    
    if (socket) {
      try {
        websocketUrl = socket.endPointURL?.toString() || socket.url?.toString() || 'no-url';
        // Extract apikey from URL
        const urlObj = websocketUrl !== 'no-url' ? new URL(websocketUrl) : null;
        if (urlObj) {
          apikeyFromUrl = urlObj.searchParams.get('apikey') || 'no-apikey';
          apikeyLength = apikeyFromUrl.length;
          // Check if it's the anon key (short JWT) or user token (long JWT)
          // Anon key is typically ~150-200 chars, user token is ~1000+ chars
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
          isAnonKey = apikeyFromUrl === anonKey;
          isUserToken = apikeyLength > 500; // User tokens are much longer
        }
      } catch (e) {
        websocketUrl = `error-parsing: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    
    // Also check the realtime client's accessToken
    const accessTokenGetter = (realtimeClient as any)?.accessToken;
    let accessTokenValue = null;
    let accessTokenLength = 0;
    if (typeof accessTokenGetter === 'function') {
      try {
        const result = accessTokenGetter();
        if (result instanceof Promise) {
          accessTokenValue = '[Promise]';
        } else {
          accessTokenValue = result;
          accessTokenLength = typeof result === 'string' ? result.length : 0;
        }
      } catch (e) {
        accessTokenValue = '[Error]';
      }
    }
    
    // Log to console for user visibility
    if (status === 'CHANNEL_ERROR' || error) {
      console.error(`[realtime:${topic}] ${status}`, {
        error: error?.message,
        websocketUrl,
        apikeyLength,
        isAnonKey,
        isUserToken,
        apikeyPreview: apikeyFromUrl !== 'unknown' && apikeyFromUrl !== 'no-apikey' ? `${apikeyFromUrl.substring(0, 30)}...` : apikeyFromUrl
      });
    }
    
    fetch('http://127.0.0.1:7242/ingest/a8444a6b-d39b-4910-bf7c-06b0f9241b8a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'realtimeClient.ts:74',message:'Channel subscribe callback with websocket details',data:{topic,status,hasError:!!error,errorMessage:error?.message,websocketUrl,apikeyFromUrl:apikeyFromUrl!=='unknown'&&apikeyFromUrl!=='no-apikey'?apikeyFromUrl.substring(0,50)+'...':apikeyFromUrl,apikeyLength,isAnonKey,isUserToken,hasAccessToken:!!accessTokenGetter,accessTokenLength,accessTokenPreview:typeof accessTokenValue==='string'?accessTokenValue.substring(0,50)+'...':String(accessTokenValue)},timestamp:Date.now(),sessionId:'debug-session',runId:'run9',hypothesisId:'I,J'})}).catch(()=>{});
    // #endregion
    logRealtime(topic, `status:${status}`, error ? { error: error.message } : undefined);
    onStatus?.(status, error ?? undefined);
  });

  return () => {
    logRealtime(topic, 'cleanup');
    supabase.removeChannel(channel);
  };
}

