import type { AdminBackupListItem } from '../../../shared/types/adminBackup.js';
import type { ApiClient } from '../api.js';

export interface AdminBackupApiMethods {
  listAdminBackups(): Promise<{ backups: AdminBackupListItem[] }>;
  startAdminBackup(input: { filename: string }): Promise<{ message: string; jobId: string; reusedExisting: boolean }>;
  getAdminBackupJob(jobId: string): Promise<{ job: unknown }>;
  cancelAdminBackupJob(jobId: string): Promise<{ message: string }>;
  deleteAdminBackup(folderId: string): Promise<void>;
  restoreAdminBackup(
    folderId: string,
    confirmFolder: string
  ): Promise<{ message: string; jobId: string; reusedExisting: boolean }>;
}

export const adminBackupApiMethods: AdminBackupApiMethods = {
  async listAdminBackups(this: ApiClient) {
    const response = await this.client.get<{ backups: AdminBackupListItem[] }>('/admin/backup/list');
    return response.data;
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
    const response = await this.client.get<{ job: unknown }>(`/admin/backup/jobs/${encodeURIComponent(jobId)}`);
    return response.data;
  },

  async cancelAdminBackupJob(this: ApiClient, jobId) {
    const response = await this.client.post<{ message: string }>(`/admin/backup/jobs/${encodeURIComponent(jobId)}/cancel`);
    return response.data;
  },

  async deleteAdminBackup(this: ApiClient, folderId) {
    await this.client.delete(`/admin/backup/${encodeURIComponent(folderId)}`);
  },

  async restoreAdminBackup(this: ApiClient, folderId, confirmFolder) {
    const response = await this.client.post<{ message: string; jobId: string; reusedExisting: boolean }>(
      `/admin/backup/${encodeURIComponent(folderId)}/restore`,
      { confirmFolder },
      { timeout: 60_000 }
    );
    return response.data;
  },
};
