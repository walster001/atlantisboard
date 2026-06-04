import { useCallback, useRef, useState } from 'react';
import {
  ensureAttachmentStreamUrl,
  peekAttachmentStreamUrl,
  type AttachmentStreamUrlEntry,
} from '../utils/attachmentStreamUrlClient.js';

export type { AttachmentDeliveryKind, AttachmentStreamUrlEntry } from '../utils/attachmentStreamUrlClient.js';

export interface UseAttachmentStreamUrlResult {
  readonly getStreamUrl: (attachmentId: string) => Promise<string>;
  readonly peekStreamUrl: (attachmentId: string) => string | null;
  readonly ensureStreamUrl: (attachmentId: string) => Promise<AttachmentStreamUrlEntry>;
  readonly loadingIds: ReadonlySet<string>;
}

/**
 * Resolves authenticated attachment stream URLs (presigned MinIO or API proxy).
 * Refreshes shortly before `expiresAt` for signed URLs.
 */
export function useAttachmentStreamUrl(): UseAttachmentStreamUrlResult {
  const [, bump] = useState(0);
  const loadingRef = useRef(new Set<string>());

  const triggerRefresh = useCallback(() => {
    bump((n) => n + 1);
  }, []);

  const loadStreamUrl = useCallback(
    async (attachmentId: string): Promise<AttachmentStreamUrlEntry> => {
      loadingRef.current.add(attachmentId);
      triggerRefresh();
      try {
        return await ensureAttachmentStreamUrl(attachmentId);
      } finally {
        loadingRef.current.delete(attachmentId);
        triggerRefresh();
      }
    },
    [triggerRefresh],
  );

  const ensureStreamUrl = useCallback(
    async (attachmentId: string): Promise<AttachmentStreamUrlEntry> => {
      return loadStreamUrl(attachmentId);
    },
    [loadStreamUrl],
  );

  const getStreamUrl = useCallback(
    async (attachmentId: string): Promise<string> => {
      const entry = await ensureStreamUrl(attachmentId);
      return entry.url;
    },
    [ensureStreamUrl],
  );

  const peekStreamUrl = useCallback((attachmentId: string): string | null => {
    return peekAttachmentStreamUrl(attachmentId);
  }, []);

  return {
    getStreamUrl,
    peekStreamUrl,
    ensureStreamUrl,
    loadingIds: loadingRef.current,
  };
}
