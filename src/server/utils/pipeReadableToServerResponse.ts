import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Readable } from 'node:stream';

export interface PipeReadableToServerResponseOptions {
  readonly onStreamError?: (error: Error) => void;
}

/**
 * Pipe a readable stream to an HTTP response and tear down the source stream when the client
 * disconnects before the response finishes (avoids orphaned MinIO reads on aborted video seeks).
 */
export function pipeReadableToServerResponse(
  req: IncomingMessage,
  res: ServerResponse,
  stream: Readable,
  options?: PipeReadableToServerResponseOptions,
): void {
  let cleaned = false;

  const cleanup = (destroyStream: boolean): void => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    req.removeListener('close', onClientClose);
    res.removeListener('finish', onFinish);
    stream.removeListener('error', onStreamError);
    if (destroyStream && !stream.destroyed) {
      stream.destroy();
    }
  };

  /** Client disconnected before the response completed (socket closed). */
  const onClientClose = (): void => {
    if (!res.writableEnded) {
      cleanup(true);
    }
  };

  const onFinish = (): void => {
    cleanup(false);
  };

  const onStreamError = (error: Error): void => {
    cleanup(true);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end();
    } else if (!res.writableEnded) {
      res.destroy();
    }
    options?.onStreamError?.(error);
  };

  req.on('close', onClientClose);
  res.on('finish', onFinish);
  stream.on('error', onStreamError);
  stream.pipe(res);
}
