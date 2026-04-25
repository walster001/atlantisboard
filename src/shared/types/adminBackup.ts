export interface AdminBackupListItem {
  readonly folderId: string;
  readonly objectKey: string;
  readonly sizeBytes: number;
  readonly lastModified: string;
}
