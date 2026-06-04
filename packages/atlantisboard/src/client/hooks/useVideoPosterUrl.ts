import { useEffect, useState } from 'react';
import { extractAttachmentIdFromMediaSrc } from '../../shared/cardDescriptionAttachmentRefs.js';
import { api } from '../utils/api.js';
import { captureVideoPosterBlobFromMediaUrl } from '../utils/captureVideoPoster.js';

function attachmentPosterProxyUrl(attachmentId: string): string {
  const fromApi = api.getAttachmentFileUrl(attachmentId);
  if (fromApi.startsWith('/')) {
    return fromApi;
  }
  try {
    const parsed = new URL(fromApi);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fromApi;
  }
}

function toAbsoluteAppUrl(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  if (trimmed === '') {
    return '';
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
  }
  return trimmed;
}

function resolveStoredPosterPath(storedPoster: string | undefined): string {
  const trimmed = storedPoster?.trim() ?? '';
  if (trimmed === '') {
    return '';
  }
  const attachmentId = extractAttachmentIdFromMediaSrc(trimmed);
  if (attachmentId != null) {
    return attachmentPosterProxyUrl(attachmentId);
  }
  const resolved = api.resolveAttachmentUrl(trimmed);
  if (resolved.startsWith('/')) {
    return resolved;
  }
  try {
    const parsed = new URL(resolved);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return resolved;
  }
}

async function fetchImageBlobUrl(pathOrUrl: string): Promise<string> {
  const absolute = toAbsoluteAppUrl(pathOrUrl);
  if (absolute === '') {
    throw new Error('Empty poster URL');
  }
  const response = await fetch(absolute, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Poster fetch failed (${response.status})`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

function isAppAttachmentUrl(url: string): boolean {
  return url.includes('/attachments/') && url.includes('/file');
}

/**
 * Blob/object URL for a video poster — persisted JPEG attachment (fetched with cookies) or
 * a client-generated frame from the proxy playback URL.
 */
export function useVideoPosterUrl(
  proxyPlaybackSrc: string,
  storedPoster: string | undefined,
): string | undefined {
  const storedPosterPath = resolveStoredPosterPath(storedPoster);
  const [posterObjectUrl, setPosterObjectUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;

    const setUrl = (url: string | undefined): void => {
      if (!cancelled) {
        setPosterObjectUrl(url);
      }
    };

    void (async () => {
      setUrl(undefined);

      if (storedPosterPath !== '') {
        try {
          objectUrl = await fetchImageBlobUrl(storedPosterPath);
          if (cancelled) {
            if (objectUrl != null) {
              URL.revokeObjectURL(objectUrl);
            }
            return;
          }
          setUrl(objectUrl);
          return;
        } catch {
          /* Fall through to generated frame */
        }
      }

      const playback = proxyPlaybackSrc.trim();
      if (playback === '') {
        return;
      }

      try {
        const useCredentials = isAppAttachmentUrl(playback);
        const blob = await captureVideoPosterBlobFromMediaUrl(playback, { useCredentials });
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        setUrl(undefined);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl != null) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [proxyPlaybackSrc, storedPosterPath]);

  return posterObjectUrl;
}
