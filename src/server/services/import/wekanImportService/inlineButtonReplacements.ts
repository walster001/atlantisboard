import type { InlineButtonIconReplacement } from '../../../../shared/import/importPreflight.js';
import type { WekanInlineButtonImportReplacement } from '../../../../shared/import/wekanLegacyInlineHtml.js';
import { parseDataUrl } from '../../../../shared/import/atlantisboardNormalize.js';
import { uploadImportInlineImage } from '../../importInlineAssetService.js';
import { logger } from '../../../utils/logger.js';

export async function buildWekanInlineButtonReplacementMap(
  replacements: readonly InlineButtonIconReplacement[] | undefined,
): Promise<{
  readonly replacementByIconSrc: ReadonlyMap<string, WekanInlineButtonImportReplacement>;
  readonly skipLocalizationIconSrcs: ReadonlySet<string>;
}> {
  const replacementByIconSrc = new Map<string, WekanInlineButtonImportReplacement>();
  const skipLocalizationIconSrcs = new Set<string>();

  for (const entry of replacements ?? []) {
    const iconSrc = entry.iconSrc.trim();
    if (iconSrc === '') {
      continue;
    }

    const dataUrl = entry.replacementDataUrl?.trim() ?? '';
    if (dataUrl === '') {
      continue;
    }

    skipLocalizationIconSrcs.add(iconSrc);
    let iconUrl = dataUrl;
    const parsed = parseDataUrl(dataUrl);
    if (parsed != null) {
      try {
        iconUrl = await uploadImportInlineImage(parsed.buffer, parsed.mimeType, 'wekan-button-replacement.jpg');
      } catch (error) {
        logger.warn({ error, iconSrc }, 'Failed to upload Wekan inline button replacement icon');
      }
    }

    replacementByIconSrc.set(iconSrc, { iconUrl });
  }

  return { replacementByIconSrc, skipLocalizationIconSrcs };
}
