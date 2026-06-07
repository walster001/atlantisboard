import type {
  AdminFileStorageBucketsResponse,
  AdminFileStorageCreateFolderResponse,
  AdminFileStorageDeleteResponse,
  AdminFileStorageListResponse,
  AdminFileStorageUploadResponse,
} from '../../../shared/types/adminFileStorage.js';
import type { MinioBucketName } from '../../../shared/constants/minioBuckets.js';
import { ADMIN_DESTRUCTIVE_CONFIRM_PHRASE } from '../../../shared/adminDestructiveConfirmation.js';
import { downloadBlob, parseContentDispositionFilename } from '../downloadBlob.js';
import type { ApiClient } from '../api.js';

export interface AdminFileStorageApiMethods {
  listAdminFileStorageBuckets(): Promise<AdminFileStorageBucketsResponse>;
  listAdminFileStorageObjects(
    bucket: MinioBucketName,
    prefix?: string,
  ): Promise<AdminFileStorageListResponse>;
  createAdminFileStorageFolder(input: {
    bucket: MinioBucketName;
    prefix?: string;
    folderName: string;
  }): Promise<AdminFileStorageCreateFolderResponse>;
  uploadAdminFileStorageObject(input: {
    bucket: MinioBucketName;
    prefix?: string;
    file: File;
  }): Promise<AdminFileStorageUploadResponse>;
  downloadAdminFileStorageObject(bucket: MinioBucketName, key: string): Promise<void>;
  fetchAdminFileStorageObjectBlob(bucket: MinioBucketName, key: string): Promise<Blob>;
  deleteAdminFileStorageObjects(
    bucket: MinioBucketName,
    keys: readonly string[],
  ): Promise<AdminFileStorageDeleteResponse>;
}

export const adminFileStorageApiMethods: AdminFileStorageApiMethods = {
  async listAdminFileStorageBuckets(this: ApiClient) {
    const response = await this.client.get<AdminFileStorageBucketsResponse>('/admin/file-storage/buckets');
    return response.data;
  },

  async listAdminFileStorageObjects(this: ApiClient, bucket, prefix) {
    const response = await this.client.get<AdminFileStorageListResponse>('/admin/file-storage/objects', {
      params: { bucket, prefix: prefix ?? '' },
    });
    return response.data;
  },

  async createAdminFileStorageFolder(this: ApiClient, input) {
    const response = await this.client.post<AdminFileStorageCreateFolderResponse>(
      '/admin/file-storage/folders',
      input,
    );
    return response.data;
  },

  async uploadAdminFileStorageObject(this: ApiClient, input) {
    const formData = new FormData();
    formData.append('file', input.file);
    formData.append('bucket', input.bucket);
    if (input.prefix != null && input.prefix !== '') {
      formData.append('prefix', input.prefix);
    }
    const response = await this.client.post<AdminFileStorageUploadResponse>(
      '/admin/file-storage/upload',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
      },
    );
    return response.data;
  },

  async downloadAdminFileStorageObject(this: ApiClient, bucket, key) {
    const response = await this.client.get('/admin/file-storage/download', {
      params: { bucket, key },
      responseType: 'blob',
    });
    const fallback = key.split('/').pop() ?? 'download';
    const filename = parseContentDispositionFilename(response.headers['content-disposition'], fallback);
    downloadBlob(response.data, filename);
  },

  async fetchAdminFileStorageObjectBlob(this: ApiClient, bucket, key) {
    const response = await this.client.get('/admin/file-storage/download', {
      params: { bucket, key },
      responseType: 'blob',
    });
    return response.data;
  },

  async deleteAdminFileStorageObjects(this: ApiClient, bucket, keys) {
    const response = await this.client.delete<AdminFileStorageDeleteResponse>('/admin/file-storage/objects', {
      data: {
        bucket,
        keys,
        confirmPhrase: ADMIN_DESTRUCTIVE_CONFIRM_PHRASE,
      },
    });
    return response.data;
  },
};
