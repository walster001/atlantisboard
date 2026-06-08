import { z } from 'zod';
import { ADMIN_DESTRUCTIVE_CONFIRM_PHRASE } from '../../../shared/adminDestructiveConfirmation.js';
import type { AdminBackupListItem } from '../../../shared/types/adminBackup.js';
import type {
  AdminBackupLocationCheckResult,
  AdminBackupLocationStatus,
} from '../../../shared/types/adminBackupLocation.js';
import type { ApiClient } from '../api.js';
import { downloadBlob, parseContentDispositionFilename } from '../downloadBlob.js';

export const adminBackupJobResponseSchema = z.object({
  job: z.unknown(),
});

export type AdminBackupJobResponse = z.infer<typeof adminBackupJobResponseSchema>;

export function parseAdminBackupJobResponse(data: unknown): AdminBackupJobResponse {
  return adminBackupJobResponseSchema.parse(data);
}

export interface AdminBackupApiMethods {
  listAdminBackups(): Promise<{ backups: AdminBackupListItem[] }>;
  getAdminBackupLocation(): Promise<{ status: AdminBackupLocationStatus }>;
  checkAdminBackupLocation(path: string): Promise<{ result: AdminBackupLocationCheckResult }>;
  setAdminBackupLocation(input: {
    path: string;
    createIfMissing: boolean;
  }): Promise<{ status: AdminBackupLocationStatus }>;
  downloadAdminBackup(folderId: string): Promise<void>;
  startAdminBackup(input: { filename: string }): Promise<{ message: string; jobId: string; reusedExisting: boolean }>;
  getAdminBackupJob(jobId: string): Promise<AdminBackupJobResponse>;
  cancelAdminBackupJob(jobId: string): Promise<{ message: string }>;
  deleteAdminBackup(folderId: string): Promise<void>;
  restoreAdminBackup(
    folderId: string,
    confirmFolder: string
  ): Promise<{ message: string; jobId: string; reusedExisting: boolean }>;
  importAdminBackup(
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<AdminBackupImportResponse>;
}

export interface AdminBackupImportResponse {
  readonly message: string;
  readonly folderId: string;
  readonly sizeBytes: number;
  readonly jobId: string;
  readonly backupSource: 'imported';
}

export const adminBackupApiMethods: AdminBackupApiMethods = {
  async listAdminBackups(this: ApiClient) {
    const response = await this.client.get<{ backups: AdminBackupListItem[] }>('/admin/backup/list');
    return response.data;
  },

  async getAdminBackupLocation(this: ApiClient) {
    const response = await this.client.get<{ status: AdminBackupLocationStatus }>('/admin/backup/location');
    return response.data;
  },

  async checkAdminBackupLocation(this: ApiClient, path) {
    const response = await this.client.post<{ result: AdminBackupLocationCheckResult }>(
      '/admin/backup/location/check',
      { path },
    );
    return response.data;
  },

  async setAdminBackupLocation(this: ApiClient, input) {
    const response = await this.client.put<{ status: AdminBackupLocationStatus }>('/admin/backup/location', input);
    return response.data;
  },

  async downloadAdminBackup(this: ApiClient, folderId) {
    const response = await this.client.get(`/admin/backup/${encodeURIComponent(folderId)}/download`, {
      responseType: 'blob',
      timeout: 0,
    });
    const fallback = `${folderId}.zip`;
    const filename = parseContentDispositionFilename(response.headers['content-disposition'], fallback);
    downloadBlob(response.data, filename);
  },

  async startAdminBackup(this: ApiClient, input) {
    const response = await this.client.post<{ message: string; jobId: string; reusedExisting: boolean }>(
      '/admin/backup/run',
      input,
      { timeout: 60_000 }
    );
    return response.data;
  },

  async getAdminBackupJob(this: ApiClient, jobId) {
    const response = await this.client.get(`/admin/backup/jobs/${encodeURIComponent(jobId)}`);
    return parseAdminBackupJobResponse(response.data);
  },

  async cancelAdminBackupJob(this: ApiClient, jobId) {
    const response = await this.client.post<{ message: string }>(`/admin/backup/jobs/${encodeURIComponent(jobId)}/cancel`);
    return response.data;
  },

  async deleteAdminBackup(this: ApiClient, folderId) {
    await this.client.delete(`/admin/backup/${encodeURIComponent(folderId)}`, {
      data: { confirmPhrase: ADMIN_DESTRUCTIVE_CONFIRM_PHRASE },
    });
  },

  async restoreAdminBackup(this: ApiClient, folderId, confirmFolder) {
    const response = await this.client.post<{ message: string; jobId: string; reusedExisting: boolean }>(
      `/admin/backup/${encodeURIComponent(folderId)}/restore`,
      { confirmFolder },
      { timeout: 60_000 }
    );
    return response.data;
  },

  async importAdminBackup(this: ApiClient, file, onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.client.postForm<AdminBackupImportResponse>(
      '/admin/backup/import',
      formData,
      {
        timeout: 0,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total != null && progressEvent.total > 0 && onProgress != null) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(progress);
          }
        },
      },
    );
    return response.data;
  },
};
