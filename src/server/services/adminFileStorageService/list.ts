import { MINIO_BUCKET_NAMES, type MinioBucketName } from '../../../shared/constants/minioBuckets.js';
import type {
  AdminFileStorageBucketInfo,
  AdminFileStorageListResponse,
  AdminFileStorageObjectEntry,
} from '../../../shared/types/adminFileStorage.js';
import { getMinIOClient } from '../../config/minio.js';
import { assertAllowedBucket, getMinioBucketLabel, normalizeStoragePrefix } from './validation.js';

type ListedItem = {
  readonly name?: string;
  readonly prefix?: string;
  readonly size?: number;
  readonly lastModified?: Date;
};

function relativeEntryName(fullKey: string, prefix: string): string {
  if (prefix !== '' && fullKey.startsWith(prefix)) {
    return fullKey.slice(prefix.length);
  }
  return fullKey;
}

function toEntryFromObject(item: ListedItem, prefix: string): AdminFileStorageObjectEntry | null {
  if (typeof item.name !== 'string' || item.name.trim() === '') {
    return null;
  }
  const key = item.name;
  const name = relativeEntryName(key, prefix);
  if (name === '' || name.endsWith('/')) {
    return null;
  }
  return {
    name,
    key,
    isFolder: false,
    size: typeof item.size === 'number' ? item.size : null,
    lastModified: item.lastModified instanceof Date ? item.lastModified.toISOString() : null,
    contentType: null,
  };
}

function toEntryFromPrefix(item: ListedItem, prefix: string): AdminFileStorageObjectEntry | null {
  if (typeof item.prefix !== 'string' || item.prefix.trim() === '') {
    return null;
  }
  const key = item.prefix;
  const name = relativeEntryName(key, prefix);
  if (name === '') {
    return null;
  }
  return {
    name,
    key,
    isFolder: true,
    size: null,
    lastModified: null,
    contentType: null,
  };
}

async function listBucketItems(bucket: MinioBucketName, prefix: string): Promise<readonly ListedItem[]> {
  const client = getMinIOClient();
  const stream = client.listObjectsV2(bucket, prefix, false);
  return await new Promise<readonly ListedItem[]>((resolve, reject) => {
    const items: ListedItem[] = [];
    stream.on('data', (obj: ListedItem) => {
      items.push(obj);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(items));
  });
}

export async function listAdminFileStorageBuckets(): Promise<readonly AdminFileStorageBucketInfo[]> {
  const client = getMinIOClient();
  const buckets: AdminFileStorageBucketInfo[] = [];
  for (const name of MINIO_BUCKET_NAMES) {
    let exists = false;
    try {
      exists = await client.bucketExists(name);
    } catch {
      exists = false;
    }
    buckets.push({
      name,
      label: getMinioBucketLabel(name),
      exists,
    });
  }
  return buckets;
}

export async function listAdminFileStorageObjects(
  bucketName: string,
  prefixInput: string | undefined,
): Promise<AdminFileStorageListResponse> {
  const bucket = assertAllowedBucket(bucketName);
  const prefix = normalizeStoragePrefix(prefixInput);
  const items = await listBucketItems(bucket, prefix);
  const entries: AdminFileStorageObjectEntry[] = [];

  for (const item of items) {
    const folderEntry = toEntryFromPrefix(item, prefix);
    if (folderEntry != null) {
      entries.push(folderEntry);
      continue;
    }
    const fileEntry = toEntryFromObject(item, prefix);
    if (fileEntry != null) {
      entries.push(fileEntry);
    }
  }

  entries.sort((a, b) => {
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return { bucket, prefix, entries };
}
