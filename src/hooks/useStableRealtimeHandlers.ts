import { useRef, useMemo, useEffect, useCallback } from 'react';
import { WorkspaceHandlers } from '@/realtime/workspaceSubscriptions';
import { createEventBatcher, EventBatcherOptions } from '@/realtime/eventBatcher';

// Generate unique ID for handler tracking
let handlerIdCounter = 0;
function generateHandlerId(): string {
  return `handler_${Date.now()}_${++handlerIdCounter}`;
}

export interface StableHandlerOptions {
  disableBatchingFor?: Array<keyof WorkspaceHandlers>; // Handlers to skip batching
}

/**
 * Hook that wraps realtime handlers with stable references and optional event batching.
 * Prevents stale closures by ensuring handler object reference doesn't change.
 */
export function useStableRealtimeHandlers<T extends WorkspaceHandlers>(
  handlers: T,
  dependencies: React.DependencyList,
  options?: StableHandlerOptions
): T & { __handlerId: string; __cleanup: () => void } {
  // Generate unique ID on first render
  const handlerIdRef = useRef<string | null>(null);
  if (handlerIdRef.current === null) {
    handlerIdRef.current = generateHandlerId();
  }

  // Store handlers in ref to maintain stable reference
  const handlersRef = useRef<T>(handlers);
  const cleanupFunctionsRef = useRef<Array<() => void>>([]);

  // Update handlers ref when dependencies change
  useEffect(() => {
    handlersRef.current = handlers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlers, ...dependencies]);

  // Create stable handler object that doesn't change reference
  const stableHandlers = useMemo(() => {
    const stable: Partial<T> = {};
    const cleanupFunctions: Array<() => void> = [];

    // Wrap each handler with batching if it's a high-frequency handler
    const handlerKeys: Array<keyof WorkspaceHandlers> = [
      'onBoardUpdate',
      'onColumnUpdate',
      'onCardUpdate',
      'onCardDetailUpdate',
      'onMemberUpdate',
      'onWorkspaceUpdate',
      'onInviteUpdate',
      'onParentRefresh',
    ];

    const disableBatching = options?.disableBatchingFor || [];

    for (const key of handlerKeys) {
      const originalHandler = handlers[key];
      if (!originalHandler) continue;

      // Skip batching if disabled for this handler
      if (disableBatching.includes(key)) {
        // No batching - use handler directly but wrap to access latest ref
        // Type assertion needed because we're wrapping handlers with different signatures
        // @ts-expect-error - Complex generic type that requires any assertion
        stable[key] = ((...args: unknown[]) => {
          // Access latest handler from ref
          const currentHandler = handlersRef.current[key];
          if (currentHandler && typeof currentHandler === 'function') {
            // Type assertion: currentHandler has the same type as T[typeof key]
            (currentHandler as (...args: unknown[]) => void)(...args);
          }
        }) as T[typeof key];
        continue;
      }

      // Determine batching options based on handler type
      // Use Record<string, unknown> as the base type for batching options
      // The actual entity types will be handled at runtime
      let batchingOptions: EventBatcherOptions<Record<string, unknown>> | undefined;
      
      if (key === 'onCardUpdate') {
        // High frequency - batch quickly
        batchingOptions = {
          batchDelayMs: 16,
          maxBatchSize: 50,
          deduplicateBy: (e) => (e.entity as { id?: string })?.id || '',
        };
      } else if (key === 'onColumnUpdate') {
        // High frequency - batch quickly
        batchingOptions = {
          batchDelayMs: 16,
          maxBatchSize: 50,
          deduplicateBy: (e) => (e.entity as { id?: string })?.id || '',
        };
      } else if (key === 'onBoardUpdate') {
        // Medium frequency - adaptive batching
        batchingOptions = {
          batchDelayMs: 50,
          maxBatchSize: 100,
          deduplicateBy: (e) => (e.entity as { id?: string })?.id || '',
        };
      } else if (key === 'onMemberUpdate') {
        // Lower frequency - longer delay
        batchingOptions = {
          batchDelayMs: 100,
          maxBatchSize: 100,
          deduplicateBy: (e) => {
            const entity = e.entity as { userId?: string; boardId?: string };
            return `${entity?.userId || ''}_${entity?.boardId || ''}`;
          },
        };
      }
      // onWorkspaceUpdate, onInviteUpdate, onParentRefresh - no batching (low frequency)

      if (batchingOptions) {
        // Wrap with batching
        // Use Record<string, unknown> as the generic type - runtime types are compatible
        const batcher = createEventBatcher<Record<string, unknown>>((events) => {
          // Process each event in the batch
          for (const batchedEvent of events) {
            const currentHandler = handlersRef.current[key];
            if (currentHandler && typeof currentHandler === 'function') {
              (currentHandler as (entity: unknown, event: unknown) => void)(batchedEvent.entity, batchedEvent.event);
            }
          }
        }, batchingOptions);

        // Type assertion needed for generic handler types
        // @ts-expect-error - Complex generic type that requires any assertion
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stable[key] = batcher.handler as any as T[typeof key];
        cleanupFunctions.push(batcher.cleanup);
      } else {
        // No batching - use handler directly but wrap to access latest ref
        // Type assertion needed because we're wrapping handlers with different signatures
        // @ts-expect-error - Complex generic type that requires any assertion
        stable[key] = ((...args: unknown[]) => {
          // Access latest handler from ref
          const currentHandler = handlersRef.current[key];
          if (currentHandler && typeof currentHandler === 'function') {
            (currentHandler as (...args: unknown[]) => void)(...args);
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any as T[typeof key];
      }
    }

    cleanupFunctionsRef.current = cleanupFunctions;

    return stable as T;
    // Only recreate if options change (structure change), not when handlers change
    // handlersRef.current is updated via useEffect, so handlers always access latest implementations
    
  }, [handlers, options?.disableBatchingFor]);

  // Cleanup function to process pending batches
  const cleanup = useCallback(() => {
    cleanupFunctionsRef.current.forEach(cleanupFn => cleanupFn());
    cleanupFunctionsRef.current = [];
  }, []);

  // Add handler ID and cleanup to returned object
  return {
    ...stableHandlers,
    __handlerId: handlerIdRef.current,
    __cleanup: cleanup,
  } as T & { __handlerId: string; __cleanup: () => void };
}

