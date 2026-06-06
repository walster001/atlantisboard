import { useMemo } from 'react';
import type { CardDB } from '../../store/database.js';
import {
  cardDescriptionFirstLogicalLinePlain,
  isCardDescriptionEmpty,
  parseCardDescriptionJson,
} from '../card/cardDescriptionTiptap.js';

export interface SortableCardDescriptionPreview {
  readonly hasDescription: boolean;
  readonly showRichDescPreview: boolean;
  readonly descriptionPreviewFirstLine: string;
  readonly deferredDescriptionFallbackText: string;
}

export function useSortableCardDescriptionPreview(
  card: CardDB,
  showDescriptionPreview: boolean,
): SortableCardDescriptionPreview {
  const hasDescription = typeof card.description === 'string' && card.description.trim() !== '';
  const descDocForPreview = useMemo(
    () => (hasDescription ? parseCardDescriptionJson(card.description) : null),
    [card.description, hasDescription],
  );
  const showRichDescPreview =
    showDescriptionPreview && hasDescription && descDocForPreview != null && !isCardDescriptionEmpty(descDocForPreview);

  const descriptionFirstLinePlain = useMemo((): string => {
    if (!showRichDescPreview) {
      return '';
    }
    return cardDescriptionFirstLogicalLinePlain(card.description);
  }, [showRichDescPreview, card.description]);

  const descriptionPreviewFirstLine = useMemo((): string => {
    const raw = card.descriptionPreview;
    if (typeof raw !== 'string' || raw.trim() === '') {
      return '';
    }
    return (raw.split(/\r?\n/)[0] ?? '').trim();
  }, [card.descriptionPreview]);

  const deferredDescriptionFallbackText = useMemo((): string => {
    if (descriptionFirstLinePlain !== '') {
      return descriptionFirstLinePlain;
    }
    if (descriptionPreviewFirstLine !== '') {
      return descriptionPreviewFirstLine;
    }
    return '\u00a0';
  }, [descriptionFirstLinePlain, descriptionPreviewFirstLine]);

  return {
    hasDescription,
    showRichDescPreview,
    descriptionPreviewFirstLine,
    deferredDescriptionFallbackText,
  };
}
