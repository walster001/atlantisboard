export interface AdminBackupListItem {
  readonly folderId: string;
  readonly filePath: string;
  readonly sizeBytes: number;
  readonly lastModified: string;
  readonly status?: 'completed' | 'processing' | 'pending' | 'failed' | 'cancelled';
  readonly progress?: number;
  readonly jobId?: string;
}
