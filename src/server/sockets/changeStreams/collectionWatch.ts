import type { Server as SocketIOServer } from 'socket.io';
import type { ChangeStream, ChangeStreamDocument, ChangeStreamOptions, ResumeToken } from 'mongodb';
import type { Model, PipelineStage } from 'mongoose';
import { logger } from '../../utils/logger.js';
import { deleteResumeTokenAsync, loadResumeToken, persistResumeTokenAsync } from './resumeTokenStore.js';
import {
  attachChangeStreamErrorHandler,
  registerChangeStream,
  unregisterChangeStream,
} from './streamRegistry.js';
import type { ChangeStreamChangeEvent } from './types.js';

export type CollectionStreamId =
  | 'workspace'
  | 'board'
  | 'list'
  | 'card'
  | 'activity'
  | 'boardlabel'
  | 'invitelink';

const MAX_RECONNECT_ATTEMPTS = 12;
const BASE_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

export interface StartCollectionWatchParams<T = unknown> {
  streamId: CollectionStreamId;
  label: string;
  model: Model<T>;
  pipeline: PipelineStage[];
  watchOptions?: ChangeStreamOptions;
  onChange: (change: ChangeStreamChangeEvent<unknown>) => void;
  io: SocketIOServer;
}

function toChangeEvent(change: ChangeStreamDocument): ChangeStreamChangeEvent<unknown> {
  return change as ChangeStreamChangeEvent<unknown>;
}

function reconnectDelayMs(attempt: number): number {
  return Math.min(BASE_RECONNECT_MS * 2 ** attempt, MAX_RECONNECT_MS);
}

/**
 * Opens a resumable collection watch, persists resume tokens to Redis, and reconnects on transient errors.
 */
export async function startCollectionWatch<T = unknown>(params: StartCollectionWatchParams<T>): Promise<void> {
  const { streamId, label, model, pipeline, watchOptions = {}, onChange } = params;
  void params.io;

  let activeStream: ChangeStream<ChangeStreamDocument> | null = null;
  let closed = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const clearReconnectTimer = (): void => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const closeActiveStream = async (): Promise<void> => {
    if (activeStream === null) {
      return;
    }
    const stream = activeStream;
    activeStream = null;
    unregisterChangeStream(label);
    await stream.close().catch((error: unknown) => {
      logger.error({ error, label }, 'Error closing change stream before reconnect');
    });
  };

  const scheduleReconnect = (reason: string): void => {
    if (closed || reconnectTimer !== null) {
      return;
    }
    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      logger.error({ label, streamId, reconnectAttempt }, 'Change stream reconnect attempts exhausted');
      return;
    }
    const delayMs = reconnectDelayMs(reconnectAttempt);
    reconnectAttempt += 1;
    logger.warn({ label, streamId, delayMs, reason }, 'Scheduling change stream reconnect');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void openStream().catch((error: unknown) => {
        logger.error({ error, label, streamId }, 'Change stream reconnect failed');
        scheduleReconnect('open_failed');
      });
    }, delayMs);
  };

  const openStream = async (): Promise<void> => {
    await closeActiveStream();

    const resumeAfter = await loadResumeToken(streamId);
    const options: ChangeStreamOptions = {
      ...watchOptions,
      ...(resumeAfter !== null ? { resumeAfter } : {}),
    };

    const watchPipeline: Record<string, unknown>[] = pipeline.map((stage) => ({ ...stage }));
    const stream = model.watch(watchPipeline, options);
    activeStream = stream;
    reconnectAttempt = 0;

    attachChangeStreamErrorHandler(stream, label, () => {
      if (!closed) {
        scheduleReconnect('stream_error');
      }
    });

    stream.on('change', (change: ChangeStreamDocument) => {
      const resumeToken = change._id as ResumeToken | undefined;
      persistResumeTokenAsync(streamId, resumeToken);

      if (change.operationType === 'invalidate') {
        logger.warn(
          { label, streamId },
          'Change stream invalidated (collection dropped/renamed); clearing resume token and restarting',
        );
        deleteResumeTokenAsync(streamId);
        scheduleReconnect('invalidate');
        return;
      }

      onChange(toChangeEvent(change));
    });

    registerChangeStream(label, {
      close: async () => {
        closed = true;
        clearReconnectTimer();
        await closeActiveStream();
      },
      on: (ev, fn) => {
        stream.on(ev, fn);
      },
    });

    if (resumeAfter !== null) {
      logger.info({ label, streamId }, 'Change stream resumed after stored token');
    }
  };

  await openStream();
}
