import { logger } from '../../utils/logger.js';
import { isChangeStreamReplicaSetError } from './helpers.js';

type ClosableChangeStream = {
  close: () => Promise<void>;
  on: (ev: 'error', fn: (err: unknown) => void) => void;
};

const changeStreamsByLabel = new Map<string, ClosableChangeStream>();
let changeStreamReplicaSetErrorLogged = false;

export function registerChangeStream(label: string, stream: ClosableChangeStream): void {
  changeStreamsByLabel.set(label, stream);
}

export function unregisterChangeStream(label: string): void {
  changeStreamsByLabel.delete(label);
}

export function attachChangeStreamErrorHandler(
  stream: ClosableChangeStream,
  label: string,
  onRecoverableError?: () => void,
): void {
  stream.on('error', (err: unknown) => {
    if (isChangeStreamReplicaSetError(err)) {
      if (!changeStreamReplicaSetErrorLogged) {
        changeStreamReplicaSetErrorLogged = true;
        logger.warn(
          'MongoDB Change Streams stopped: $changeStream requires a replica set (40573). Use Atlas or rs.initiate(), or set ENABLE_CHANGE_STREAMS=false.'
        );
        void closeAllChangeStreams();
      }
      return;
    }
    logger.error({ err, label }, 'Change stream error');
    onRecoverableError?.();
  });
}

export async function closeAllChangeStreams(): Promise<void> {
  const streams = [...changeStreamsByLabel.values()];
  changeStreamsByLabel.clear();
  await Promise.all(
    streams.map((stream) =>
      stream.close().catch((error) => {
        logger.error({ error }, 'Error closing change stream');
      }),
    ),
  );
  logger.info('All change streams closed');
}
