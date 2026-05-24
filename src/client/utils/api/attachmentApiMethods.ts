import type { ApiClient } from '../api.js';
import { API_BASE_URL } from './shared.js';

export interface AttachmentApiMethods {
  uploadCardAttachment(cardId: string, file: File, onProgress?: (progress: number) => void): Promise<{ attachment: unknown }>;
  deleteCardAttachment(cardId: string, attachmentId: string): Promise<void>;
  getAttachmentUrl(attachmentId: string): Promise<{ url: string }>;
  getAttachmentFileUrl(attachmentId: string): string;
  resolveAttachmentUrl(rawUrl: string): string;
}

export const attachmentApiMethods: AttachmentApiMethods = {
  async uploadCardAttachment(this: ApiClient, cardId, file, onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    // postForm avoids default `application/json` on the ApiClient (which would stringify FormData).
    // Browser adapter clears Content-Type so the boundary is set correctly for efficient streaming.
    const response = await this.client.postForm(`/cards/${cardId}/attachments`, formData, {
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });
    return response.data as { attachment: unknown };
  },

  async deleteCardAttachment(this: ApiClient, cardId, attachmentId) {
    await this.client.delete(`/cards/${cardId}/attachments/${attachmentId}`);
  },

  async getAttachmentUrl(this: ApiClient, attachmentId) {
    const response = await this.client.get(`/attachments/${attachmentId}/url`);
    return response.data as { url: string };
  },

  getAttachmentFileUrl(this: ApiClient, attachmentId) {
    const safeId = encodeURIComponent(attachmentId);
    return `${API_BASE_URL}/attachments/${safeId}/file`;
  },

  resolveAttachmentUrl(this: ApiClient, rawUrl) {
    const trimmed = rawUrl.trim();
    if (trimmed === '') return '';
    if (trimmed.startsWith('/')) return trimmed;
    if (trimmed.startsWith('api/')) return `/${trimmed}`;
    if (/^https?:\/\//.test(trimmed)) {
      try {
        const parsed = new URL(trimmed);
        if (parsed.pathname.startsWith('/card-attachments/')) {
          return `${parsed.pathname}${parsed.search}`;
        }
      } catch {
        return trimmed;
      }
      return trimmed;
    }
    return trimmed;
  },
};
