import { buildVideoAbrStreamPath } from '../../../shared/videoStreaming.js';
import type { VideoAbrFormat } from '../../../shared/videoStreaming.js';

function rewriteUriAttribute(line: string, attachmentId: string, format: VideoAbrFormat): string {
  return line.replace(/URI="([^"]+)"/gi, (_match, uri: string) => {
    const trimmed = uri.trim();
    if (trimmed === '' || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return `URI="${uri}"`;
    }
    return `URI="${buildVideoAbrStreamPath(attachmentId, format, trimmed)}"`;
  });
}

/** Rewrite relative segment/variant URIs in an HLS playlist for API proxy delivery. */
export function rewriteHlsPlaylistForProxy(
  raw: string,
  attachmentId: string,
  playlistRelativePath: string,
): string {
  const baseDir = playlistRelativePath.includes('/')
    ? playlistRelativePath.slice(0, playlistRelativePath.lastIndexOf('/') + 1)
    : '';

  return raw
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === '') {
        return line;
      }
      if (trimmed.startsWith('#')) {
        return rewriteUriAttribute(line, attachmentId, 'hls');
      }
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return line;
      }
      const resolved = trimmed.startsWith('/')
        ? trimmed.slice(1)
        : `${baseDir}${trimmed}`.replace(/\/+/g, '/');
      return buildVideoAbrStreamPath(attachmentId, 'hls', resolved);
    })
    .join('\n');
}

/** Rewrite relative media paths in a DASH MPD for API proxy delivery. */
export function rewriteDashManifestForProxy(raw: string, attachmentId: string): string {
  return raw.replace(
    /((?:initialization|media|sourceURL)=")([^"]+)(")/gi,
    (_match, prefix: string, uri: string, suffix: string) => {
      const trimmed = uri.trim();
      if (trimmed === '' || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return `${prefix}${uri}${suffix}`;
      }
      const resolved = trimmed.replace(/^\//, '');
      return `${prefix}${buildVideoAbrStreamPath(attachmentId, 'dash', resolved)}${suffix}`;
    },
  );
}
