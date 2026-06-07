import { MINIO_BUCKET_FONTS, type MinioBucketName } from '../../../shared/constants/minioBuckets.js';
import type { AdminFileStorageOrphanScanResponse } from '../../../shared/types/adminFileStorage.js';
import { getMinIOClient } from '../../config/minio.js';
import {
  countReferencedKeys,
  countScannedObjects,
  findOrphanedObjects,
  type ScannedMinioObject,
} from './orphanDiff.js';
import {
  collectInUseMinioObjectKeys,
  markValidFontObjectKeyAsInUse,
  ORPHAN_SCAN_BUCKET_NAMES,
} from './orphanReferences.js';

async function listAllBucketObjects(bucket: MinioBucketName): Promise<readonly ScannedMinioObject[]> {
  const client = getMinIOClient();
  const stream = client.listObjectsV2(bucket, '', true);
  return await new Promise<readonly ScannedMinioObject[]>((resolve, reject) => {
    const objects: ScannedMinioObject[] = [];
    stream.on('data', (obj: { name?: string; size?: number }) => {
      if (typeof obj.name !== 'string' || obj.name.trim() === '') {
        return;
      }
      objects.push({
        key: obj.name,
        size: typeof obj.size === 'number' && Number.isFinite(obj.size) ? obj.size : 0,
      });
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(objects));
  });
}

export async function scanAdminFileStorageOrphans(): Promise<AdminFileStorageOrphanScanResponse> {
  const startedAt = Date.now();
  const inUseKeys = await collectInUseMinioObjectKeys();
  const bucketObjects = new Map<MinioBucketName, readonly ScannedMinioObject[]>();

  for (const bucket of ORPHAN_SCAN_BUCKET_NAMES) {
    const objects = await listAllBucketObjects(bucket);
    if (bucket === MINIO_BUCKET_FONTS) {
      for (const object of objects) {
        markValidFontObjectKeyAsInUse(inUseKeys, object.key);
      }
    }
    bucketObjects.set(bucket, objects);
  }

  const orphans = findOrphanedObjects(bucketObjects, inUseKeys);

  return {
    orphans,
    scannedBuckets: ORPHAN_SCAN_BUCKET_NAMES.length,
    scannedObjects: countScannedObjects(bucketObjects),
    referencedObjects: countReferencedKeys(inUseKeys),
    durationMs: Date.now() - startedAt,
  };
}
