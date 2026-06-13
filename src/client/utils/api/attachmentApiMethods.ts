import { z } from 'zod';
import type { ApiClient } from '../api.js';
import { API_BASE_URL } from './shared.js';
import {
  ATTACHMENT_SCAN_STATUSES,
  isAttachmentViewable,
  type AttachmentScanStatus,
} from '../../../shared/attachmentScanStatus.js';

export type AttachmentDeliveryKind = 'signed' | 'proxy';

export interface AttachmentStreamUrlResponse {
  readonly url: string;
  readonly expiresAt: string;
  readonly delivery: AttachmentDeliveryKind;
}

export const attachmentUploadResponseSchema = z.object({
  attachment: z
    .object({
      id: z.string().optional(),
      scanStatus: z.enum(ATTACHMENT_SCAN_STATUSES).optional(),
    })
    .passthrough()
    .optional(),
});

export type AttachmentUploadResponse = z.infer<typeof attachmentUploadResponseSchema>;

export function parseAttachmentUploadResponse(data: unknown): AttachmentUploadResponse {
  return attachmentUploadResponseSchema.parse(data);
}

export function requireUploadedAttachmentId(response: AttachmentUploadResponse): string {
  if (response.attachment == null || typeof response.attachment !== 'object') {
    throw new Error('Upload succeeded but attachment id was missing.');
  }
  const id = response.attachment.id;
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('Upload succeeded but attachment id was missing.');
  }
  return id;
}

export function uploadedAttachmentScanStatus(
  response: AttachmentUploadResponse,
): AttachmentScanStatus | undefined {
  return response.attachment?.scanStatus;
}

export function uploadScanCompletesImmediately(response: AttachmentUploadResponse): boolean {
  const status = uploadedAttachmentScanStatus(response);
  return status == null || isAttachmentViewable(status);
}

export interface AttachmentApiMethods {
  prewarmMalwareScanner(): Promise<void>;
  uploadCardAttachment(cardId: string, file: File, onProgress?: (progress: number) => void): Promise<AttachmentUploadResponse>;
  deleteCardAttachment(cardId: string, attachmentId: string): Promise<void>;
  getAttachmentUrl(attachmentId: string): Promise<AttachmentStreamUrlResponse>;
  getAttachmentFileUrl(attachmentId: string): string;
  resolveAttachmentUrl(rawUrl: string): string;
}

export const attachmentApiMethods: AttachmentApiMethods = {
  async prewarmMalwareScanner(this: ApiClient) {
    await this.client.post('/scan/prewarm');
  },

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
    return parseAttachmentUploadResponse(response.data);
  },

  async deleteCardAttachment(this: ApiClient, cardId, attachmentId) {
    await this.client.delete(`/cards/${cardId}/attachments/${attachmentId}`);
  },

  async getAttachmentUrl(this: ApiClient, attachmentId) {
    const response = await this.client.get(`/attachments/${attachmentId}/url`);
    return response.data as AttachmentStreamUrlResponse;
  },

  getAttachmentFileUrl(this: ApiClient, attachmentId) {
    const safeId = encodeURIComponent(attachmentId);
    return `${API_BASE_URL}/attachments/${safeId}/file`;
  },

  resolveAttachmentUrl(this: ApiClient, rawUrl) {
    const trimmed = rawUrl.trim();
    if (trimmed === '') return '';
    if (trimmed.startsWith('/api/v1/attachments/')) {
      return trimmed.split('?')[0] ?? trimmed;
    }
    if (trimmed.startsWith('/')) return trimmed;
    if (trimmed.startsWith('api/')) return `/${trimmed}`;
    if (/^https?:\/\//.test(trimmed)) {
      try {
        const parsed = new URL(trimmed);
        const host = parsed.hostname.toLowerCase();
        if (host === 'minio' || host === 'kanboard-minio' || host.endsWith('.internal')) {
          return '';
        }
        if (parsed.pathname.startsWith('/card-attachments/')) {
          return '';
        }
      } catch {
        return trimmed;
      }
      return trimmed;
    }
    return trimmed;
  },
};
