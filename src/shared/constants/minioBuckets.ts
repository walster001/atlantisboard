/** MinIO bucket for Trello/Wekan import inline image replacements. */
export const MINIO_BUCKET_IMPORT_INLINE = 'import-inline' as const;

/** MinIO bucket for card file attachments. */
export const MINIO_BUCKET_CARD_ATTACHMENTS = 'card-attachments' as const;

/** MinIO bucket for login / app branding images (served via signed app URLs). */
export const MINIO_BUCKET_BRANDING = 'branding' as const;

/** MinIO bucket for uploaded custom UI fonts. */
export const MINIO_BUCKET_FONTS = 'fonts' as const;

/** MinIO bucket for user profile pictures. */
export const MINIO_BUCKET_USER_AVATARS = 'user-avatars' as const;

/** MinIO bucket for board background images uploaded via board theme settings. */
export const MINIO_BUCKET_BACKGROUNDS = 'backgrounds' as const;

/**
 * All buckets ensured by {@link initializeMinIOBuckets} on server startup.
 * Application backup ZIPs are stored on disk at {@link BACKUP_LOCATION}, not in MinIO.
 * Keep Docker `mc mb` lists in sync when adding a bucket.
 */
export const MINIO_BUCKET_NAMES = [
  MINIO_BUCKET_IMPORT_INLINE,
  MINIO_BUCKET_CARD_ATTACHMENTS,
  MINIO_BUCKET_BRANDING,
  MINIO_BUCKET_FONTS,
  MINIO_BUCKET_USER_AVATARS,
  MINIO_BUCKET_BACKGROUNDS,
] as const;

export type MinioBucketName = (typeof MINIO_BUCKET_NAMES)[number];
