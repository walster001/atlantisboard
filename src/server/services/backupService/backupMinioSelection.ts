import type { MinioBucketName } from '../../../shared/constants/minioBuckets.js';

/** MinIO export target used by backup executor (empty prefix = entire bucket). */
export interface BackupMinioSelection {
  readonly bucket: MinioBucketName;
  readonly prefix: string;
}
