import type { MinioBucketName } from '../constants/minioBuckets.js';

/** JSON from `GET /api/v1/admin/file-storage/buckets`. */
export type AdminFileStorageBucketInfo = {
  readonly name: MinioBucketName;
  readonly label: string;
  readonly exists: boolean;
};

export type AdminFileStorageBucketsResponse = {
  readonly buckets: readonly AdminFileStorageBucketInfo[];
};

/** One row in the object browser (file or folder prefix). */
export type AdminFileStorageObjectEntry = {
  /** Storage object key segment shown in the current folder (often a UUID filename). */
  readonly name: string;
  readonly key: string;
  readonly isFolder: boolean;
  readonly size: number | null;
  readonly lastModified: string | null;
  readonly contentType: string | null;
  /** Human-friendly label from card attachments or MinIO metadata when available. */
  readonly displayName?: string;
};

/** JSON from `GET /api/v1/admin/file-storage/objects`. */
export type AdminFileStorageListResponse = {
  readonly bucket: MinioBucketName;
  readonly prefix: string;
  readonly entries: readonly AdminFileStorageObjectEntry[];
};

/** JSON from `POST /api/v1/admin/file-storage/folders`. */
export type AdminFileStorageCreateFolderResponse = {
  readonly bucket: MinioBucketName;
  readonly key: string;
};

/** JSON from `POST /api/v1/admin/file-storage/upload`. */
export type AdminFileStorageUploadResponse = {
  readonly bucket: MinioBucketName;
  readonly key: string;
  readonly size: number;
};

/** JSON from `DELETE /api/v1/admin/file-storage/objects`. */
export type AdminFileStorageDeleteResponse = {
  readonly deletedCount: number;
};

/** Bucket + object key pair for orphan cleanup. */
export type AdminFileStorageOrphanObjectRef = {
  readonly bucket: MinioBucketName;
  readonly key: string;
};

/** One orphaned object reported by the orphan scan. */
export type AdminFileStorageOrphanEntry = AdminFileStorageOrphanObjectRef & {
  readonly size: number;
};

/** JSON from `POST /api/v1/admin/file-storage/orphans/scan`. */
export type AdminFileStorageOrphanScanResponse = {
  readonly orphans: readonly AdminFileStorageOrphanEntry[];
  readonly scannedBuckets: number;
  readonly scannedObjects: number;
  readonly referencedObjects: number;
  readonly durationMs: number;
};

/** JSON from `POST /api/v1/admin/file-storage/orphans/delete`. */
export type AdminFileStorageOrphanDeleteResponse = {
  readonly deletedCount: number;
};

/** JSON from `GET` / `PATCH /api/v1/admin/file-storage/malware-scan`. */
export type AdminMalwareScanSettings = {
  readonly enabled: boolean;
  readonly persistedToEnvFile: boolean;
  readonly productionEnforced: boolean;
};
