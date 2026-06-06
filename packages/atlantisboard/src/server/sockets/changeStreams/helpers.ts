import { MongoServerError } from 'mongodb';

export function isChangeStreamReplicaSetError(err: unknown): boolean {
  return (
    err instanceof MongoServerError &&
    (err.code === 40573 || err.codeName === 'Location40573')
  );
}

/**
 * Change Streams need a replica set; standalone MongoDB returns 40573.
 * - DISABLE_CHANGE_STREAMS=true → never run
 * - ENABLE_CHANGE_STREAMS=true|false → explicit
 * - Otherwise: on in production only (backward compatible); off in development (avoids standalone noise)
 */
export function shouldRunChangeStreams(): boolean {
  const dis = process.env.DISABLE_CHANGE_STREAMS?.trim().toLowerCase();
  if (dis === 'true' || dis === '1' || dis === 'yes') {
    return false;
  }
  const en = process.env.ENABLE_CHANGE_STREAMS?.trim().toLowerCase();
  if (en === 'true' || en === '1' || en === 'yes') {
    return true;
  }
  if (en === 'false' || en === '0' || en === 'no') {
    return false;
  }
  return process.env.NODE_ENV === 'production';
}

export function getChangeEventName(operationType: string): string {
  switch (operationType) {
    case 'insert':
      return 'created';
    case 'update':
    case 'replace':
      return 'updated';
    case 'delete':
      return 'deleted';
    default:
      return 'changed';
  }
}
