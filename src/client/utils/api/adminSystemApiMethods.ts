import type { PublicCustomFontEntry } from '../../../shared/types/customFonts.js';
import type { AdminSystemMetricsSnapshot, MetricsHistoryEntry } from '../../../shared/types/adminSystemMetrics.js';
import type { ApiClient } from '../api.js';

let fontsCatalogCache: Promise<{ fonts: PublicCustomFontEntry[] }> | null = null;

export function invalidateFontsCatalogCache(): void {
  fontsCatalogCache = null;
}

export interface AdminSystemApiMethods {
  getPermissionSets(): Promise<{ permissionSets: unknown[] }>;
  createPermissionSet(data: {
    name: string;
    description?: string;
    permissions: string[];
  }): Promise<{ permissionSet: unknown }>;
  getRoles(): Promise<{ roles: unknown[] }>;
  createRole(data: {
    key: string;
    displayName: string;
    description?: string;
    permissions: string[];
    hierarchyLevel: number;
  }): Promise<{ role: unknown }>;
  updateRole(roleKey: string, patch: {
    displayName?: string;
    description?: string;
    permissions?: string[];
    hierarchyLevel?: number;
  }): Promise<{ role: unknown }>;
  deleteRole(roleKey: string): Promise<void>;
  getAdminConfig(): Promise<{ config: unknown }>;
  updateAdminConfig(config: unknown): Promise<{ config: unknown }>;
  testExternalMysqlConnection(
    body:
      | { useSavedCredentials: true }
      | {
          host: string;
          port?: number;
          database: string;
          username: string;
          password?: string;
          verificationQuery?: string;
        }
  ): Promise<{ ok: boolean; message: string }>;
  testSmtpEmail(recipientEmail: string): Promise<{ ok: boolean; message: string }>;
  getFontsCatalog(): Promise<{ fonts: PublicCustomFontEntry[] }>;
  uploadCustomFont(file: File, displayName?: string): Promise<{ font: PublicCustomFontEntry }>;
  deleteCustomFontFile(fileName: string): Promise<void>;
  getAdminSystemMetrics(): Promise<AdminSystemMetricsSnapshot>;
  getAdminSystemMetricsHistory(): Promise<readonly MetricsHistoryEntry[]>;
}

export const adminSystemApiMethods: AdminSystemApiMethods = {
  async getPermissionSets(this: ApiClient) {
    const response = await this.client.get('/admin/permission-sets');
    return response.data as { permissionSets: unknown[] };
  },

  async createPermissionSet(this: ApiClient, data) {
    const response = await this.client.post('/admin/permission-sets', data);
    return response.data as { permissionSet: unknown };
  },

  async getRoles(this: ApiClient) {
    const response = await this.client.get('/admin/roles');
    return response.data as { roles: unknown[] };
  },

  async createRole(this: ApiClient, data) {
    const response = await this.client.post('/admin/roles', data);
    return response.data as { role: unknown };
  },

  async updateRole(this: ApiClient, roleKey, patch) {
    const response = await this.client.put(`/admin/roles/${encodeURIComponent(roleKey)}`, patch);
    return response.data as { role: unknown };
  },

  async deleteRole(this: ApiClient, roleKey) {
    await this.client.delete(`/admin/roles/${encodeURIComponent(roleKey)}`);
  },

  async getAdminConfig(this: ApiClient) {
    const response = await this.client.get('/admin/config');
    return response.data as { config: unknown };
  },

  async updateAdminConfig(this: ApiClient, config) {
    const response = await this.client.put('/admin/config', config);
    return response.data as { config: unknown };
  },

  async testExternalMysqlConnection(this: ApiClient, body) {
    const response = await this.client.post<{ ok: boolean; message: string }>('/admin/config/test-external-mysql', body);
    return response.data;
  },

  async testSmtpEmail(this: ApiClient, recipientEmail) {
    const response = await this.client.post<{ ok: boolean; message: string }>('/admin/email/test', { recipientEmail });
    return response.data;
  },

  async getFontsCatalog(this: ApiClient) {
    if (!fontsCatalogCache) {
      fontsCatalogCache = this.client
        .get<{ fonts: PublicCustomFontEntry[] }>('/fonts')
        .then((r) => r.data)
        .catch((e: unknown) => {
          fontsCatalogCache = null;
          throw e;
        });
    }
    return fontsCatalogCache;
  },

  async uploadCustomFont(this: ApiClient, file, displayName) {
    const form = new FormData();
    form.append('file', file);
    if (typeof displayName === 'string' && displayName.trim() !== '') {
      form.append('displayName', displayName.trim());
    }
    const response = await this.client.post<{ font: PublicCustomFontEntry }>('/admin/fonts/upload', form, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    invalidateFontsCatalogCache();
    return response.data;
  },

  async deleteCustomFontFile(this: ApiClient, fileName) {
    await this.client.delete(`/admin/fonts/${encodeURIComponent(fileName)}`);
    invalidateFontsCatalogCache();
  },

  async getAdminSystemMetrics(this: ApiClient) {
    const response = await this.client.get<AdminSystemMetricsSnapshot>('/admin/system/metrics');
    return response.data;
  },

  async getAdminSystemMetricsHistory(this: ApiClient) {
    const response = await this.client.get<readonly MetricsHistoryEntry[]>('/admin/system/metrics/history');
    return response.data;
  },
};
