import { deriveCardDescriptionPreview } from '../../cardViewService.js';
import { plainTextToCardDescriptionJson } from '../../../../shared/utils/plainTextToCardDescriptionJson.js';
import { markdownToCardDescriptionJson } from '../../../../shared/utils/markdownToCardDescriptionJson.js';

export function cardDescriptionFields(desc: string | undefined): {
  description: string | undefined;
  descriptionPreview: string;
  descriptionCharCount: number;
} {
  if (desc == null || desc === '') {
    return { description: undefined, descriptionPreview: '', descriptionCharCount: 0 };
  }
  const description = markdownToCardDescriptionJson(desc) ?? plainTextToCardDescriptionJson(desc);
  const { preview, charCount } = deriveCardDescriptionPreview(description);
  return {
    description,
    descriptionPreview: preview,
    descriptionCharCount: charCount,
  };
}
