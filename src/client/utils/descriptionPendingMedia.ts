import {
  isAllowedTextStyleColor,
  isSafeInlineStyleString,
  validateHref,
  validateInlineButtonIconSrc,
  validateMediaSrc,
} from '../../shared/validation/cardDescriptionDoc/primitives.js';
import { parseTwemojiSpriteCoord } from '../../shared/twemojiSpriteCoord.js';

/** Blob URLs for description media staged during edit; keyed by object URL. */
export type DescriptionPendingMediaRegistry = Map<string, File>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when serialized description JSON still references staged blob: media URLs. */
export function descriptionJsonHasBlobUrls(jsonString: string): boolean {
  return jsonString.includes('blob:');
}

function collectBlobMediaSrcsFromDescriptionNode(node: unknown, blobs: string[]): void {
  if (!isRecord(node) || typeof node.type !== 'string') {
    return;
  }
  const attrs = node.attrs;
  if (isRecord(attrs)) {
    for (const key of ['src', 'poster', 'iconSrc', 'coverSrc'] as const) {
      const value = attrs[key];
      if (typeof value === 'string' && isPendingDescriptionMediaSrc(value)) {
        blobs.push(value);
      }
    }
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      collectBlobMediaSrcsFromDescriptionNode(child, blobs);
    }
  }
}

/** Blob media URLs in description JSON that are not registered for upload on save. */
export function findOrphanedBlobUrlsInDescriptionJson(
  jsonString: string,
  registry: DescriptionPendingMediaRegistry,
): readonly string[] {
  if (!descriptionJsonHasBlobUrls(jsonString)) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString) as unknown;
  } catch {
    return ['blob:'];
  }
  const blobs: string[] = [];
  collectBlobMediaSrcsFromDescriptionNode(parsed, blobs);
  return [...new Set(blobs)].filter((url) => !registry.has(url));
}

export function registerPendingDescriptionMediaFile(
  registry: DescriptionPendingMediaRegistry,
  file: File,
): string {
  const blobUrl = URL.createObjectURL(file);
  registry.set(blobUrl, file);
  return blobUrl;
}

export function discardPendingDescriptionMedia(registry: DescriptionPendingMediaRegistry): void {
  for (const blobUrl of registry.keys()) {
    URL.revokeObjectURL(blobUrl);
  }
  registry.clear();
}

/** Revoke staged blob URLs after the editor no longer references them. */
export function revokeDescriptionMediaBlobUrls(urls: readonly string[]): void {
  for (const blobUrl of urls) {
    URL.revokeObjectURL(blobUrl);
  }
}

export function isPendingDescriptionMediaSrc(src: string): boolean {
  return src.trim().startsWith('blob:');
}

export type UploadDescriptionMediaFile = (
  file: File,
  onProgress?: (progress: number) => void,
) => Promise<string>;

export type FlushPendingDescriptionMediaResult = {
  readonly jsonString: string;
  /** Blob URLs replaced in JSON but not yet revoked — sync editor before revoking. */
  readonly flushedBlobUrls: readonly string[];
};

export async function flushPendingDescriptionMediaInJson(
  jsonString: string,
  registry: DescriptionPendingMediaRegistry,
  uploadFile: UploadDescriptionMediaFile,
): Promise<FlushPendingDescriptionMediaResult> {
  if (registry.size === 0) {
    return { jsonString, flushedBlobUrls: [] };
  }

  let result = jsonString;
  const flushedBlobUrls: string[] = [];
  for (const [blobUrl, file] of [...registry.entries()]) {
    if (!result.includes(blobUrl)) {
      URL.revokeObjectURL(blobUrl);
      registry.delete(blobUrl);
      continue;
    }
    const attachmentUrl = await uploadFile(file);
    result = result.split(blobUrl).join(attachmentUrl);
    flushedBlobUrls.push(blobUrl);
    registry.delete(blobUrl);
  }
  return { jsonString: result, flushedBlobUrls };
}

function isDevLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '0.0.0.0';
}

/** Rewrite dev http links to relative paths; upgrade other http to https when possible. */
function normalizeHttpLinkHrefForSave(href: string): string {
  const trimmed = href.trim();
  if (!trimmed.startsWith('http://')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const sameOrigin =
      typeof window !== 'undefined' &&
      host === window.location.hostname.toLowerCase() &&
      parsed.port === window.location.port;
    if (isDevLoopbackHost(host) || sameOrigin) {
      const relative = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      return relative !== '' ? relative : '/';
    }
    return `https://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return trimmed;
  }
}

function sanitizeLinkMarks(marks: unknown): unknown[] | undefined {
  if (!Array.isArray(marks)) {
    return undefined;
  }
  const next: unknown[] = [];
  for (const mark of marks) {
    if (!isRecord(mark) || mark.type !== 'link' || !isRecord(mark.attrs)) {
      next.push(mark);
      continue;
    }
    const href = mark.attrs.href;
    if (typeof href !== 'string') {
      continue;
    }
    const normalizedHref = normalizeHttpLinkHrefForSave(href);
    if (!validateHref(normalizedHref)) {
      continue;
    }
    next.push(
      normalizedHref === href
        ? mark
        : { ...mark, attrs: { ...mark.attrs, href: normalizedHref } },
    );
  }
  return next.length > 0 ? next : undefined;
}

function sanitizeOptionalDimensionAttr(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || !/^[0-9]{1,4}$/.test(value.trim())) {
    return undefined;
  }
  return value.trim();
}

function sanitizeInlineButtonAttrsForSave(attrs: Record<string, unknown>): Record<string, unknown> | null {
  const hrefRaw = attrs.href;
  if (typeof hrefRaw !== 'string') {
    return null;
  }
  const href = normalizeHttpLinkHrefForSave(hrefRaw.trim());
  if (!validateHref(href)) {
    return null;
  }
  const buttonText = attrs.buttonText;
  if (typeof buttonText !== 'string' || buttonText.trim() === '' || buttonText.length > 500) {
    return null;
  }
  const borderRadiusPx = attrs.borderRadiusPx;
  if (
    typeof borderRadiusPx !== 'number' ||
    !Number.isInteger(borderRadiusPx) ||
    borderRadiusPx < 0 ||
    borderRadiusPx > 48
  ) {
    return null;
  }
  const iconSizePx = attrs.iconSizePx;
  if (
    typeof iconSizePx !== 'number' ||
    !Number.isInteger(iconSizePx) ||
    iconSizePx < 8 ||
    iconSizePx > 128
  ) {
    return null;
  }
  if (!isAllowedTextStyleColor(attrs.textColor) || !isAllowedTextStyleColor(attrs.bgColor)) {
    return null;
  }
  const next: Record<string, unknown> = {
    ...attrs,
    href,
    buttonText: buttonText.trim(),
  };
  const iconSrc = attrs.iconSrc;
  if (iconSrc === null || iconSrc === undefined || iconSrc === '') {
    delete next.iconSrc;
  } else if (typeof iconSrc !== 'string' || !validateInlineButtonIconSrc(iconSrc.trim())) {
    delete next.iconSrc;
  } else {
    next.iconSrc = iconSrc.trim();
  }
  const width = sanitizeOptionalDimensionAttr(attrs.width);
  if (width === undefined) {
    delete next.width;
  } else {
    next.width = width;
  }
  if (
    typeof next.containerStyle === 'string' &&
    !isSafeInlineStyleString(next.containerStyle)
  ) {
    delete next.containerStyle;
  }
  if (typeof next.wrapperStyle === 'string' && !isSafeInlineStyleString(next.wrapperStyle)) {
    delete next.wrapperStyle;
  }
  return next;
}

function sanitizeAudioAttrsForSave(attrs: Record<string, unknown>): Record<string, unknown> | null {
  const src = attrs.src;
  if (typeof src !== 'string' || !validateMediaSrc(src)) {
    return null;
  }
  const next: Record<string, unknown> = { ...attrs, src: src.trim() };
  const width = sanitizeOptionalDimensionAttr(attrs.width);
  if (width === undefined) {
    delete next.width;
  } else {
    next.width = width;
  }
  const height = sanitizeOptionalDimensionAttr(attrs.height);
  if (height === undefined) {
    delete next.height;
  } else {
    next.height = height;
  }
  const coverSrc = next.coverSrc;
  if (
    coverSrc !== undefined &&
    coverSrc !== null &&
    coverSrc !== '' &&
    (typeof coverSrc !== 'string' || !validateInlineButtonIconSrc(coverSrc.trim()))
  ) {
    delete next.coverSrc;
  } else if (typeof coverSrc === 'string') {
    next.coverSrc = coverSrc.trim();
  }
  if (typeof next.containerStyle === 'string' && !isSafeInlineStyleString(next.containerStyle)) {
    delete next.containerStyle;
  }
  for (const key of ['textColor', 'bgColor', 'buttonHoverColor'] as const) {
    const value = next[key];
    if (
      value !== null &&
      value !== undefined &&
      value !== '' &&
      !isAllowedTextStyleColor(value)
    ) {
      delete next[key];
    }
  }
  return next;
}

function twemojiHasValidSprite(attrs: Record<string, unknown>): boolean {
  const sx = parseTwemojiSpriteCoord(attrs.spriteX);
  const sy = parseTwemojiSpriteCoord(attrs.spriteY);
  return sx != null && sy != null && sx >= 0 && sy >= 0 && sx < 512 && sy < 512;
}

function sanitizeMediaAttrsForSave(
  type: 'image' | 'imageResize' | 'video' | 'audio',
  attrs: Record<string, unknown>,
): Record<string, unknown> | null {
  if (type === 'audio') {
    return sanitizeAudioAttrsForSave(attrs);
  }
  const src = attrs.src;
  if (typeof src !== 'string' || !validateMediaSrc(src)) {
    return null;
  }
  const next: Record<string, unknown> = { ...attrs, src: src.trim() };
  if (type === 'video') {
    const poster = next.poster;
    if (
      poster !== undefined &&
      poster !== null &&
      poster !== '' &&
      (typeof poster !== 'string' || !validateMediaSrc(poster))
    ) {
      delete next.poster;
    }
  }
  return next;
}

function sanitizeDescriptionNodeForSave(node: unknown): unknown | null {
  if (!isRecord(node) || typeof node.type !== 'string') {
    return node;
  }

  const type = node.type;

  if (type === 'text') {
    const marks = sanitizeLinkMarks(node.marks);
    if (marks === undefined) {
      const { marks: _removed, ...rest } = node;
      return rest;
    }
    if (marks === node.marks) {
      return node;
    }
    return { ...node, marks };
  }

  if (type === 'inlineButton') {
    const attrs = node.attrs;
    if (!isRecord(attrs)) {
      return null;
    }
    const sanitizedAttrs = sanitizeInlineButtonAttrsForSave(attrs);
    if (sanitizedAttrs == null) {
      return null;
    }
    return { ...node, attrs: sanitizedAttrs };
  }

  if (type === 'twemojiEmoji') {
    const attrs = node.attrs;
    if (!isRecord(attrs)) {
      return null;
    }
    const emoji = attrs.emoji;
    if (typeof emoji !== 'string' || emoji.trim() === '') {
      return null;
    }
    const src = attrs.src;
    if (src !== undefined && src !== null && src !== '') {
      if (typeof src !== 'string' || !validateMediaSrc(src.trim())) {
        if (twemojiHasValidSprite(attrs)) {
          const { src: _removed, ...restAttrs } = attrs;
          return { ...node, attrs: { ...restAttrs, emoji: emoji.trim() } };
        }
        return null;
      }
    }
    return { ...node, attrs: { ...attrs, emoji: emoji.trim() } };
  }

  if (type === 'image' || type === 'imageResize' || type === 'video' || type === 'audio') {
    const attrs = node.attrs;
    if (!isRecord(attrs)) {
      return null;
    }
    const sanitizedAttrs = sanitizeMediaAttrsForSave(type, attrs);
    if (sanitizedAttrs == null) {
      return null;
    }
    const sanitizedNode: Record<string, unknown> = { ...node, attrs: sanitizedAttrs };
    if (Array.isArray(sanitizedNode.content) && sanitizedNode.content.length > 0) {
      const { content: _removed, ...leaf } = sanitizedNode;
      return leaf;
    }
    return sanitizedNode;
  }

  if (!Array.isArray(node.content)) {
    return node;
  }

  const nextContent = node.content
    .map((child) => sanitizeDescriptionNodeForSave(child))
    .filter((child): child is unknown => child !== null);

  if (type === 'listItem' && nextContent.length === 0) {
    return null;
  }
  if ((type === 'bulletList' || type === 'orderedList') && nextContent.length === 0) {
    return null;
  }

  return { ...node, content: nextContent };
}

function finalizeSanitizedDoc(parsed: Record<string, unknown>): string {
  const sanitized = sanitizeDescriptionNodeForSave(parsed);
  if (!isRecord(sanitized) || sanitized.type !== 'doc') {
    return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
  }
  const content = Array.isArray(sanitized.content) ? sanitized.content : [];
  const finalContent = content.length > 0 ? content : [{ type: 'paragraph' }];
  return JSON.stringify({ ...sanitized, content: finalContent });
}

/**
 * Normalize dev http autolinks, drop invalid media nodes/posters, and strip bad link marks before validation.
 */
export function sanitizeCardDescriptionJsonForSave(jsonString: string): string {
  const trimmed = jsonString.trim();
  if (trimmed === '') {
    return jsonString;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return jsonString;
  }
  if (!isRecord(parsed) || parsed.type !== 'doc') {
    return jsonString;
  }
  return finalizeSanitizedDoc(parsed);
}
