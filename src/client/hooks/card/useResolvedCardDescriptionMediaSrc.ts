import { useEffect, useMemo, useState } from 'react';
import { extractAttachmentIdFromMediaSrc } from '../../../shared/cardDescriptionAttachmentRefs.js';
import { initialCardDescriptionMediaSrc } from '../../components/card/cardDescriptionMediaSrc.js';
import { resolveCardDescriptionVideoPlaybackUrl } from '../../utils/attachmentStreamUrlClient.js';

/** Resolves attachment-backed description media to a playable/proxy URL. */
export function useResolvedCardDescriptionMediaSrc(
  storedSrc: string | null | undefined,
  interactive: boolean,
): string | null {
  const trimmed = storedSrc?.trim() ?? '';
  const attachmentId = useMemo(
    () => (trimmed !== '' ? extractAttachmentIdFromMediaSrc(trimmed) : null),
    [trimmed],
  );
  const proxySrc = useMemo(
    () => (trimmed !== '' ? initialCardDescriptionMediaSrc(trimmed) : ''),
    [trimmed],
  );
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() =>
    trimmed === '' ? null : attachmentId == null || !interactive ? proxySrc : null,
  );

  useEffect(() => {
    let cancelled = false;
    if (trimmed === '') {
      setResolvedSrc(null);
      return () => {
        cancelled = true;
      };
    }
    if (attachmentId == null || !interactive) {
      setResolvedSrc(proxySrc);
      return () => {
        cancelled = true;
      };
    }
    setResolvedSrc(null);
    void resolveCardDescriptionVideoPlaybackUrl(trimmed)
      .then((url) => {
        if (!cancelled) {
          setResolvedSrc(url.trim() !== '' ? url : proxySrc);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedSrc(proxySrc);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attachmentId, interactive, proxySrc, trimmed]);

  return resolvedSrc;
}
