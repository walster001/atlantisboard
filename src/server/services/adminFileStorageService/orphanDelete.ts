import { MINIO_BUCKET_FONTS, type MinioBucketName } from '../../../shared/constants/minioBuckets.js';
import type {
  AdminFileStorageOrphanDeleteResponse,
  AdminFileStorageOrphanObjectRef,
} from '../../../shared/types/adminFileStorage.js';
import { ValidationError } from '../../../shared/errors/domainErrors.js';
import { getMinIOClient } from '../../config/minio.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { findOrphanedObjects } from './orphanDiff.js';
import {
  collectInUseMinioObjectKeys,
  markValidFontObjectKeyAsInUse,
  ORPHAN_SCAN_BUCKET_NAMES,
} from './orphanReferences.js';
import { assertAllowedBucket, assertSafeObjectKey } from './validation.js';

async function statObjectSize(bucket: MinioBucketName, key: string): Promise<number> {
  const client = getMinIOClient();
  try {
    const stat = await client.statObject(bucket, key);
    return typeof stat.size === 'number' && Number.isFinite(stat.size) ? stat.size : 0;
  } catch {
    return 0;
  }
}

async function verifyObjectsAreOrphaned(
  objects: readonly AdminFileStorageOrphanObjectRef[],
): Promise<readonly AdminFileStorageOrphanObjectRef[]> {
  if (objects.length === 0) {
    return objects;
  }

  const inUseKeys = await collectInUseMinioObjectKeys();
  const client = getMinIOClient();

  for (const bucket of ORPHAN_SCAN_BUCKET_NAMES) {
    if (bucket !== MINIO_BUCKET_FONTS) {
      continue;
    }
    const stream = client.listObjectsV2(bucket, '', true);
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (obj: { name?: string }) => {
        if (typeof obj.name === 'string') {
          markValidFontObjectKeyAsInUse(inUseKeys, obj.name);
        }
      });
      stream.on('error', reject);
      stream.on('end', () => resolve());
    });
  }

  const bucketObjects = new Map<MinioBucketName, { key: string; size: number }[]>();
  for (const object of objects) {
    const bucket = assertAllowedBucket(object.bucket);
    assertSafeObjectKey(object.key);
    const referenced = inUseKeys.get(bucket);
    if (referenced?.has(object.key) === true) {
      throw new ValidationError(`Object is referenced and cannot be deleted: ${bucket}/${object.key}`);
    }
    const list = bucketObjects.get(bucket) ?? [];
    list.push({ key: object.key, size: await statObjectSize(bucket, object.key) });
    bucketObjects.set(bucket, list);
  }

  const stillOrphaned = findOrphanedObjects(bucketObjects, inUseKeys);
  const orphanSet = new Set(stillOrphaned.map((entry) => `${entry.bucket}\0${entry.key}`));
  for (const object of objects) {
    const token = `${object.bucket}\0${object.key}`;
    if (!orphanSet.has(token)) {
      throw new ValidationError(`Object is no longer orphaned: ${object.bucket}/${object.key}`);
    }
  }

  return objects;
}

export async function deleteAdminFileStorageOrphans(params: {
  readonly objects: readonly AdminFileStorageOrphanObjectRef[];
  readonly adminUserId: string;
}): Promise<AdminFileStorageOrphanDeleteResponse> {
  if (params.objects.length === 0) {
    throw new ValidationError('At least one orphaned object is required');
  }
  if (params.objects.length > 200) {
    throw new ValidationError('Too many objects in one delete request');
  }

  const verified = await verifyObjectsAreOrphaned(params.objects);
  const client = getMinIOClient();
  const deleted: AdminFileStorageOrphanObjectRef[] = [];

  for (const object of verified) {
    const bucket = assertAllowedBucket(object.bucket);
    const key = assertSafeObjectKey(object.key);
    if (!ORPHAN_SCAN_BUCKET_NAMES.includes(bucket)) {
      throw new ValidationError(`Bucket is not eligible for orphan cleanup: ${bucket}`);
    }
    await client.removeObject(bucket, key);
    deleted.push({ bucket, key });
  }

  logAuditEvent({
    userId: params.adminUserId,
    action: 'admin.file-storage.orphan.delete',
    resourceType: 'minio',
    resourceId: 'orphan-cleanup',
    metadata: {
      deletedCount: deleted.length,
      objects: deleted,
    },
    timestamp: new Date(),
  });

  return { deletedCount: deleted.length };
}
