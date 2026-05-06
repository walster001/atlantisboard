import { logger } from '../../utils/logger.js';
import { isChangeStreamReplicaSetError } from './helpers.js';

type ClosableChangeStream = {
  close: () => Promise<void>;
  on: (ev: 'error', fn: (err: unknown) => void) => void;
};

const changeStreams: ClosableChangeStream[] = [];
let changeStreamReplicaSetErrorLogged = false;

export function registerChangeStream(stream: ClosableChangeStream): void {
  changeStreams.push(stream);
}

export function attachChangeStreamErrorHandler(stream: ClosableChangeStream, label: string): void {
  stream.on('error', (err: unknown) => {
    if (isChangeStreamReplicaSetError(err)) {
      if (!changeStreamReplicaSetErrorLogged) {
        changeStreamReplicaSetErrorLogged = true;
        logger.warn(
          'MongoDB Change Streams stopped: $changeStream requires a replica set (40573). Use Atlas or rs.initiate(), or set ENABLE_CHANGE_STREAMS=false.'
        );
        void Promise.all(changeStreams.map((s) => s.close().catch(() => undefined))).then(() => {
          changeStreams.length = 0;
        });
      }
      return;
    }
    logger.error({ err, label }, 'Change stream error');
  });
}

export async function closeAllChangeStreams(): Promise<void> {
  await Promise.all(
    changeStreams.map((stream) =>
      stream.close().catch((error) => {
        logger.error({ error }, 'Error closing change stream');
      }),
    ),
  );
  changeStreams.length = 0;
  logger.info('All change streams closed');
}
