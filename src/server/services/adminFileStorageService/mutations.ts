import type { Readable } from 'node:stream';
import type { MinioBucketName } from '../../../shared/constants/minioBuckets.js';
import type {
  AdminFileStorageCreateFolderResponse,
  AdminFileStorageDeleteResponse,
  AdminFileStorageUploadResponse,
} from '../../../shared/types/adminFileStorage.js';
import { NotFoundError, ValidationError } from '../../../shared/errors/domainErrors.js';
import { getMinIOClient } from '../../config/minio.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import {
  assertAllowedBucket,
  assertSafeObjectKey,
  buildFolderMarkerKey,
  buildObjectKey,
  sanitizeUploadFileName,
} from './validation.js';

async function listKeysWithPrefix(bucket: MinioBucketName, prefix: string): Promise<string[]> {
  const client = getMinIOClient();
  const stream = client.listObjectsV2(bucket, prefix, true);
  return await new Promise<string[]>((resolve, reject) => {
    const keys: string[] = [];
    stream.on('data', (obj: { name?: string }) => {
      if (typeof obj.name === 'string' && obj.name.trim() !== '') {
        keys.push(obj.name);
      }
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(keys));
  });
}

export async function createAdminFileStorageFolder(params: {
  readonly bucketName: string;
  readonly prefix: string | undefined;
  readonly folderName: string;
  readonly adminUserId: string;
}): Promise<AdminFileStorageCreateFolderResponse> {
  const bucket = assertAllowedBucket(params.bucketName);
  const key = buildFolderMarkerKey(params.prefix ?? '', params.folderName);
  const client = getMinIOClient();
  await client.putObject(bucket, key, Buffer.alloc(0));
  logAuditEvent({
    userId: params.adminUserId,
    action: 'admin.file-storage.folder.create',
    resourceType: 'minio',
    resourceId: `${bucket}/${key}`,
    metadata: { bucket, key },
    timestamp: new Date(),
  });
  return { bucket, key };
}

export async function uploadAdminFileStorageObject(params: {
  readonly bucketName: string;
  readonly prefix: string | undefined;
  readonly fileName: string;
  readonly buffer: Buffer;
  readonly contentType: string | undefined;
  readonly adminUserId: string;
}): Promise<AdminFileStorageUploadResponse> {
  const bucket = assertAllowedBucket(params.bucketName);
  const safeName = sanitizeUploadFileName(params.fileName);
  const key = buildObjectKey(params.prefix ?? '', safeName);
  const client = getMinIOClient();
  const meta =
    params.contentType != null && params.contentType.trim() !== ''
      ? { 'Content-Type': params.contentType.trim() }
      : undefined;
  await client.putObject(bucket, key, params.buffer, params.buffer.length, meta);
  logAuditEvent({
    userId: params.adminUserId,
    action: 'admin.file-storage.upload',
    resourceType: 'minio',
    resourceId: `${bucket}/${key}`,
    metadata: { bucket, key, size: params.buffer.length },
    timestamp: new Date(),
  });
  return { bucket, key, size: params.buffer.length };
}

export async function deleteAdminFileStorageObjects(params: {
  readonly bucketName: string;
  readonly keys: readonly string[];
  readonly adminUserId: string;
}): Promise<AdminFileStorageDeleteResponse> {
  const bucket = assertAllowedBucket(params.bucketName);
  if (params.keys.length === 0) {
    throw new ValidationError('At least one object key is required');
  }
  if (params.keys.length > 200) {
    throw new ValidationError('Too many objects in one delete request');
  }

  const client = getMinIOClient();
  const keysToRemove = new Set<string>();

  for (const rawKey of params.keys) {
    const key = assertSafeObjectKey(rawKey, { allowFolderMarker: true });
    if (key.endsWith('/')) {
      const nested = await listKeysWithPrefix(bucket, key);
      for (const nestedKey of nested) {
        keysToRemove.add(nestedKey);
      }
      keysToRemove.add(key);
    } else {
      keysToRemove.add(key);
    }
  }

  for (const key of keysToRemove) {
    await client.removeObject(bucket, key);
  }

  logAuditEvent({
    userId: params.adminUserId,
    action: 'admin.file-storage.delete',
    resourceType: 'minio',
    resourceId: bucket,
    metadata: { bucket, keys: [...keysToRemove] },
    timestamp: new Date(),
  });

  return { deletedCount: keysToRemove.size };
}

export async function getAdminFileStorageObjectStream(params: {
  readonly bucketName: string;
  readonly key: string;
}): Promise<{
  readonly stream: Readable;
  readonly contentType: string | undefined;
  readonly size: number | undefined;
  readonly fileName: string;
}> {
  const bucket = assertAllowedBucket(params.bucketName);
  const key = assertSafeObjectKey(params.key);
  const client = getMinIOClient();
  let stat;
  try {
    stat = await client.statObject(bucket, key);
  } catch {
    throw new NotFoundError('Object not found');
  }
  const stream = await client.getObject(bucket, key);
  const meta = stat.metaData as Record<string, string> | undefined;
  const contentType =
    meta?.['content-type'] ??
    meta?.['Content-Type'] ??
    undefined;
  const fileName = key.split('/').pop() ?? key;
  return {
    stream,
    contentType,
    size: typeof stat.size === 'number' ? stat.size : undefined,
    fileName,
  };
}
