import { RealtimePostgresChangesPayload } from './realtimeClient';

export interface BatchedEvent<T> {
  entity: T;
  event: RealtimePostgresChangesPayload<Record<string, unknown>>;
  timestamp: number;
  sequence?: number; // Optional sequence number for ordering
}

export interface EventBatcherOptions {
  batchDelayMs?: number; // Default: 50ms
  maxBatchSize?: number; // Default: 100
  deduplicateBy?: (event: BatchedEvent<any>) => string; // Entity ID for deduplication
}

export interface EventBatcherResult<T> {
  handler: (entity: T, event: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  cleanup: () => void; // Process pending batches
}

/**
 * Creates an event batcher that collects events and processes them in batches.
 * Prevents channel queue overflow by reducing handler execution frequency.
 */
export function createEventBatcher<T>(
  handler: (events: BatchedEvent<T>[]) => void,
  options?: EventBatcherOptions
): EventBatcherResult<T> {
  const batchDelayMs = options?.batchDelayMs ?? 50;
  const maxBatchSize = options?.maxBatchSize ?? 100;
  const deduplicateBy = options?.deduplicateBy;

  // Buffer for collecting events
  const buffer: BatchedEvent<T>[] = [];
  let timeoutId: NodeJS.Timeout | null = null;
  let sequenceCounter = 0;

  /**
   * Process the current batch of events
   */
  const processBatch = () => {
    if (buffer.length === 0) return;

    // Create a copy of the buffer and clear it
    const eventsToProcess = [...buffer];
    buffer.length = 0;

    // Clear timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    // Deduplicate if deduplication function is provided
    let processedEvents: BatchedEvent<T>[];
    if (deduplicateBy) {
      // Use Map to keep only latest event per entity
      const eventMap = new Map<string, BatchedEvent<T>>();
      
      for (const event of eventsToProcess) {
        const key = deduplicateBy(event);
        const existing = eventMap.get(key);
        
        if (!existing) {
          eventMap.set(key, event);
        } else {
          // Keep the event with higher sequence/timestamp
          const existingSeq = existing.sequence ?? 0;
          const newSeq = event.sequence ?? 0;
          const existingTime = existing.timestamp;
          const newTime = event.timestamp;
          
          // Prefer sequence number if available, otherwise use timestamp
          if (newSeq > existingSeq || (newSeq === existingSeq && newTime > existingTime)) {
            eventMap.set(key, event);
          }
        }
      }
      
      processedEvents = Array.from(eventMap.values());
    } else {
      processedEvents = eventsToProcess;
    }

    // Sort by sequence/timestamp if available for proper ordering
    processedEvents.sort((a, b) => {
      const seqA = a.sequence ?? 0;
      const seqB = b.sequence ?? 0;
      if (seqA !== seqB) return seqA - seqB;
      return a.timestamp - b.timestamp;
    });

    // Process the batch
    if (processedEvents.length > 0) {
      handler(processedEvents);
    }
  };

  /**
   * Schedule batch processing after delay
   */
  const scheduleBatch = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      processBatch();
    }, batchDelayMs);
  };

  /**
   * Handler function to be used in subscriptions
   */
  const batchedHandler = (
    entity: T,
    event: RealtimePostgresChangesPayload<Record<string, unknown>>
  ) => {
    // Extract sequence number or timestamp from event if available
    const eventTimestamp = (event.new as any)?.updatedAt 
      ? new Date((event.new as any).updatedAt).getTime()
      : Date.now();
    
    const batchedEvent: BatchedEvent<T> = {
      entity,
      event,
      timestamp: eventTimestamp,
      sequence: sequenceCounter++,
    };

    buffer.push(batchedEvent);

    // Process immediately if max batch size reached
    if (buffer.length >= maxBatchSize) {
      processBatch();
    } else {
      // Schedule batch processing
      scheduleBatch();
    }
  };

  /**
   * Cleanup function to process pending batches
   */
  const cleanup = () => {
    // Clear any pending timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    
    // Process any remaining events in buffer
    if (buffer.length > 0) {
      processBatch();
    }
  };

  return {
    handler: batchedHandler,
    cleanup,
  };
}

