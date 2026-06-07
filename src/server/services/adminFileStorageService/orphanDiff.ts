import type { MinioBucketName } from '../../../shared/constants/minioBuckets.js';
import type { AdminFileStorageOrphanEntry } from '../../../shared/types/adminFileStorage.js';

export type ScannedMinioObject = {
  readonly key: string;
  readonly size: number;
};

export function isFolderMarkerKey(key: string): boolean {
  return key.endsWith('/');
}

export function findOrphanedObjects(
  bucketObjects: ReadonlyMap<MinioBucketName, readonly ScannedMinioObject[]>,
  inUseKeys: ReadonlyMap<MinioBucketName, ReadonlySet<string>>,
): AdminFileStorageOrphanEntry[] {
  const orphans: AdminFileStorageOrphanEntry[] = [];

  for (const [bucket, objects] of bucketObjects) {
    const referenced = inUseKeys.get(bucket) ?? new Set<string>();
    for (const object of objects) {
      if (isFolderMarkerKey(object.key)) {
        continue;
      }
      if (referenced.has(object.key)) {
        continue;
      }
      orphans.push({
        bucket,
        key: object.key,
        size: object.size,
      });
    }
  }

  orphans.sort((a, b) => {
    if (a.bucket !== b.bucket) {
      return a.bucket.localeCompare(b.bucket);
    }
    return a.key.localeCompare(b.key, undefined, { sensitivity: 'base' });
  });

  return orphans;
}

export function countScannedObjects(
  bucketObjects: ReadonlyMap<MinioBucketName, readonly ScannedMinioObject[]>,
): number {
  let total = 0;
  for (const objects of bucketObjects.values()) {
    for (const object of objects) {
      if (!isFolderMarkerKey(object.key)) {
        total += 1;
      }
    }
  }
  return total;
}

export function countReferencedKeys(inUseKeys: ReadonlyMap<MinioBucketName, ReadonlySet<string>>): number {
  let total = 0;
  for (const keys of inUseKeys.values()) {
    total += keys.size;
  }
  return total;
}
