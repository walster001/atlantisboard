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
  readonly name: string;
  readonly key: string;
  readonly isFolder: boolean;
  readonly size: number | null;
  readonly lastModified: string | null;
  readonly contentType: string | null;
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
