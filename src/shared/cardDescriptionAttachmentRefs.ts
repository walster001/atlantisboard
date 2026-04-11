import { isValidCardDescriptionJsonString } from './validation/cardDescriptionDoc.js';

/** Matches API file route: .../attachments/:id/file */
const ATTACHMENT_FILE_PATH =
  /\/attachments\/([^/?#]+)\/file(?:\?|#|$)/;

export function extractAttachmentIdFromMediaSrc(src: string): string | null {
  const trimmed = src.trim();
  if (trimmed === '') {
    return null;
  }
  const match = ATTACHMENT_FILE_PATH.exec(trimmed);
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectPathTail2(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed === '') {
    return '';
  }
  const parsePath = (pathLike: string): string => {
    const noQuery = (pathLike.split('?')[0] ?? pathLike).split('#')[0] ?? pathLike;
    const normalized = decodeURIComponent(noQuery).replace(/^\/+/, '');
    const parts = normalized.split('/').filter((p) => p.length > 0);
    if (parts.length < 2) {
      return normalized;
    }
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  };
  try {
    const parsed = new URL(trimmed);
    return parsePath(parsed.pathname);
  } catch {
    return parsePath(trimmed);
  }
}

export function cardCoverReferencesAttachment(
  cover: string | undefined | null,
  attachmentId: string,
  attachmentUrl: string,
): boolean {
  if (cover == null || typeof cover !== 'string' || cover.trim() === '') {
    return false;
  }
  return mediaRefMatchesAttachment(cover, attachmentId, attachmentUrl);
}

function mediaRefMatchesAttachment(
  src: string,
  attachmentId: string,
  attachmentUrl?: string,
): boolean {
  const idFromSrc = extractAttachmentIdFromMediaSrc(src);
  if (idFromSrc != null && idFromSrc === attachmentId) {
    return true;
  }
  if (typeof attachmentUrl !== 'string' || attachmentUrl.trim() === '') {
    return false;
  }
  const srcTail = objectPathTail2(src);
  const attachmentTail = objectPathTail2(attachmentUrl);
  return srcTail !== '' && attachmentTail !== '' && srcTail === attachmentTail;
}

function walkCollectAttachmentIds(node: unknown, ids: Set<string>): void {
  if (!isRecord(node) || typeof node.type !== 'string') {
    return;
  }
  const type = node.type;
  if (type === 'image' || type === 'imageResize' || type === 'video') {
    const attrs = node.attrs;
    if (isRecord(attrs) && typeof attrs.src === 'string') {
      const id = extractAttachmentIdFromMediaSrc(attrs.src);
      if (id !== null && id.trim() !== '') {
        ids.add(id);
      }
    }
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      walkCollectAttachmentIds(child, ids);
    }
  }
}

/** Collects attachment ids referenced by inline image / imageResize / video nodes in a Tiptap JSON string. */
export function collectAttachmentIdsFromDescriptionJson(
  rawJson: string | undefined | null,
): Set<string> {
  const ids = new Set<string>();
  if (rawJson == null || rawJson.trim() === '') {
    return ids;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch {
    return ids;
  }
  walkCollectAttachmentIds(parsed, ids);
  return ids;
}

interface AttachmentLike {
  id: string;
  url: string;
}

/**
 * Collect attachment ids referenced by media nodes by matching either
 * attachment-file API URLs (/attachments/:id/file) or direct object URLs.
 */
export function collectReferencedAttachmentIdsFromDescriptionJson(
  rawJson: string | undefined | null,
  attachments: ReadonlyArray<AttachmentLike>,
): Set<string> {
  const referenced = new Set<string>();
  if (rawJson == null || rawJson.trim() === '' || attachments.length === 0) {
    return referenced;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch {
    return referenced;
  }

  const walk = (node: unknown): void => {
    if (!isRecord(node) || typeof node.type !== 'string') {
      return;
    }
    const type = node.type;
    if (type === 'image' || type === 'imageResize' || type === 'video') {
      const attrs = node.attrs;
      const src = isRecord(attrs) && typeof attrs.src === 'string' ? attrs.src : '';
      if (src !== '') {
        for (const attachment of attachments) {
          if (mediaRefMatchesAttachment(src, attachment.id, attachment.url)) {
            referenced.add(attachment.id);
            break;
          }
        }
      }
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child);
      }
    }
  };

  walk(parsed);
  return referenced;
}

function emptyDoc(): unknown {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/**
 * Removes inline image / imageResize / video nodes that reference the given attachment id.
 * Returns a valid description JSON string (falls back to empty doc if validation fails).
 */
export function stripAttachmentFromDescriptionJsonString(
  rawJson: string,
  attachmentId: string,
  attachmentUrl?: string,
): string {
  const trimmed = rawJson.trim();
  if (trimmed === '') {
    return rawJson;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return rawJson;
  }
  const stripNodeWithUrl = (node: unknown): unknown | null => {
    if (!isRecord(node) || typeof node.type !== 'string') {
      return node;
    }
    const type = node.type;
    if (type === 'image' || type === 'imageResize' || type === 'video') {
      const attrs = node.attrs;
      const src = isRecord(attrs) && typeof attrs.src === 'string' ? attrs.src : '';
      if (mediaRefMatchesAttachment(src, attachmentId, attachmentUrl)) {
        return null;
      }
      return node;
    }
    if (!Array.isArray(node.content)) {
      return node;
    }
    const nextContent = node.content
      .map((child) => stripNodeWithUrl(child))
      .filter((child): child is unknown => child !== null);
    if (type === 'listItem' && nextContent.length === 0) {
      return null;
    }
    if ((type === 'bulletList' || type === 'orderedList') && nextContent.length === 0) {
      return null;
    }
    return { ...node, content: nextContent };
  };

  const stripped = (() => {
    if (!isRecord(parsed) || parsed.type !== 'doc') {
      return parsed;
    }
    const content = Array.isArray(parsed.content) ? parsed.content : [];
    const nextContent = content
      .map((child) => stripNodeWithUrl(child))
      .filter((child): child is unknown => child !== null);
    const finalContent = nextContent.length > 0 ? nextContent : [{ type: 'paragraph' }];
    return { ...parsed, content: finalContent };
  })();
  const str = JSON.stringify(stripped);
  if (!isValidCardDescriptionJsonString(str)) {
    return JSON.stringify(emptyDoc());
  }
  return str;
}
