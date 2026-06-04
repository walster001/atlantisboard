import type { WekanCard } from './types.js';
import { uploadImportInlineImage } from '../../importInlineAssetService.js';
import { logger } from '../../../utils/logger.js';
import { normalizeInlineButtonIconSrcKey } from '../../../../shared/import/importPreflight.js';
import {
  decodeWekanHtmlEntities,
  hasLegacyWekanInlineButtonHtml,
  LEGACY_WEKAN_INLINE_BUTTON_RES,
  wekanLegacyHtmlToCardDescriptionJson,
  type WekanInlineButtonImportColorOverrides,
  type WekanInlineButtonImportReplacement,
} from '../../../../shared/import/wekanLegacyInlineHtml.js';

export function sanitizeImportedPlainText(value: string): string {
  return decodeWekanHtmlEntities(value.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

export function sanitizeImportedDescriptionText(value: string): string {
  const withBreaks = value
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, '\n');
  const stripped = decodeWekanHtmlEntities(withBreaks.replace(/<[^>]*>/g, ''));
  return stripped
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function wekanDescriptionToCardJson(
  description: string,
  replacementByIconSrc: ReadonlyMap<string, WekanInlineButtonImportReplacement>,
  localizedByIconSrc: ReadonlyMap<string, string>,
  globalColorOverrides: WekanInlineButtonImportColorOverrides = {},
): string {
  return wekanLegacyHtmlToCardDescriptionJson(
    description,
    replacementByIconSrc,
    localizedByIconSrc,
    globalColorOverrides,
  );
}

function inferImageMimeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.svg')) return 'image/svg+xml';
  if (lower.includes('.ico')) return 'image/x-icon';
  return 'image/png';
}

function resolveFetchableIconUrl(iconSrc: string): string | null {
  const trimmed = iconSrc.trim();
  if (trimmed === '') {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('/cdn') || trimmed.startsWith('/api/')) {
    const base = (process.env.APP_URL || process.env.CORS_ORIGIN || '').trim().replace(/\/$/, '');
    if (base === '') {
      return null;
    }
    return `${base}${trimmed}`;
  }
  return null;
}

function isSkippedInlineIconSrc(iconSrc: string, skipIconSrcs: ReadonlySet<string>): boolean {
  const trimmed = iconSrc.trim();
  if (trimmed === '') {
    return true;
  }
  if (skipIconSrcs.has(trimmed)) {
    return true;
  }
  const normalized = normalizeInlineButtonIconSrcKey(trimmed);
  return skipIconSrcs.has(normalized);
}

export async function buildLocalizedInlineIconMap(
  buttons: readonly { iconSrc: string }[],
  skipIconSrcs: ReadonlySet<string> = new Set(),
): Promise<Map<string, string>> {
  const localizedByIconSrc = new Map<string, string>();
  const uniqueIconSources = [
    ...new Set(
      buttons.map((b) => b.iconSrc.trim()).filter((s) => s !== '' && !isSkippedInlineIconSrc(s, skipIconSrcs)),
    ),
  ];
  for (const iconSrc of uniqueIconSources) {
    const fetchable = resolveFetchableIconUrl(iconSrc);
    if (fetchable == null) {
      continue;
    }
    try {
      const response = await fetch(fetchable);
      if (!response.ok) {
        continue;
      }
      const contentTypeRaw = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const contentType = contentTypeRaw.startsWith('image/') ? contentTypeRaw : inferImageMimeFromUrl(fetchable);
      const arr = await response.arrayBuffer();
      const buffer = Buffer.from(arr);
      if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
        continue;
      }
      const localUrl = await uploadImportInlineImage(buffer, contentType, iconSrc.split('/').pop());
      localizedByIconSrc.set(iconSrc, localUrl);
    } catch (error) {
      logger.warn({ error, iconSrc }, 'Failed to localize imported inline button icon');
    }
  }
  return localizedByIconSrc;
}

export function extractLegacyInlineButtonCandidates(cards: readonly WekanCard[]): Array<{ iconSrc: string }> {
  const out: Array<{ iconSrc: string }> = [];
  for (const card of cards) {
    const description = typeof card.description === 'string' ? card.description : '';
    if (description.trim() === '') {
      continue;
    }
    const decoded = decodeWekanHtmlEntities(description);
    for (const re of LEGACY_WEKAN_INLINE_BUTTON_RES) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null = re.exec(decoded);
      while (match != null) {
        const g1 = decodeWekanHtmlEntities((match[1] ?? '').trim());
        const g2 = decodeWekanHtmlEntities((match[2] ?? '').trim());
        const iconSrc = g1.includes('://') || g1.startsWith('/') ? g1 : g2;
        if (iconSrc !== '') {
          out.push({ iconSrc });
        }
        match = re.exec(decoded);
      }
    }
  }
  return out;
}

/** @deprecated Use hasLegacyWekanInlineButtonHtml from shared import */
export { hasLegacyWekanInlineButtonHtml };
