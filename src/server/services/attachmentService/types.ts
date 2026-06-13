import type { AttachmentDeliveryKind } from '../../config/attachmentDelivery.js';
import type { AttachmentScanStatus } from '../../../shared/attachmentScanStatus.js';

export interface FileUploadResult {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  uploadedAt: Date;
  uploadedBy: string;
  scanStatus: AttachmentScanStatus;
  /** When false, route must not unlink `localScanPath` — the scan worker deletes it. */
  releaseLocalUploadTemp?: boolean;
}

export interface UploadCardAttachmentOptions {
  /** Multer disk temp path; reused for post-upload scan when pending (avoids MinIO re-download). */
  readonly localScanPath?: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface AttachmentObjectMeta {
  readonly objectName: string;
  readonly contentType: string;
  readonly size: number;
}

export interface AttachmentStreamUrlResponse {
  readonly url: string;
  readonly expiresAt: string;
  readonly delivery: AttachmentDeliveryKind;
}

/** Small uploads: buffer in memory. Large uploads: temp path written by multer disk storage. */
export type CardAttachmentUploadPayload =
  | { readonly kind: 'memory'; readonly buffer: Buffer }
  | { readonly kind: 'disk'; readonly path: string; readonly size: number };

export function cardAttachmentPayloadBytes(file: CardAttachmentUploadPayload): number {
  return file.kind === 'memory' ? file.buffer.length : file.size;
}

export type StorageAttachmentCopyJob = {
  readonly att: import('../../models/Card.js').ICardAttachment;
  readonly newId: string;
  readonly srcObject: string;
  readonly destObjectName: string;
};

export const DUPLICATE_ATTACHMENT_COPY_CONCURRENCY = 12;
