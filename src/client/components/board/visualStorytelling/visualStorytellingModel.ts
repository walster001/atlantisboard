import type { CardDB, ListDB } from '../../../store/database.js';
import { compareCardListOrder } from '../../../../shared/utils/cardListPos.js';
import { LIST_NAME_MAX_LENGTH } from '../../../../shared/constants/entityTextLimits.js';
import { CARD_DESCRIPTION_TEXT_MAX_LENGTH } from '../../../../shared/constants/cardDescription.js';
import { resolveStoryboardBoardImageUrl } from './storyboardImage.js';

export type StorytellingSection = {
  readonly list: ListDB;
  readonly hero: CardDB | null;
  readonly content: readonly CardDB[];
};

/**
 * ponytail: lists have no cover field. Hero = first card (lowest pos) title/description/cover.
 * List.name is set to the hero title on create. Content = remaining cards.
 * Ceiling: deleting the hero promotes the next card. Dedicated hero flag if identity must stay fixed.
 */
export function splitStorytellingSectionCards(cards: readonly CardDB[]): {
  readonly hero: CardDB | null;
  readonly content: readonly CardDB[];
} {
  const sorted = [...cards].sort(compareCardListOrder);
  return { hero: sorted[0] ?? null, content: sorted.slice(1) };
}

export function storytellingImageUrl(card: CardDB): string {
  return resolveStoryboardBoardImageUrl(card);
}

export function storytellingCaption(card: CardDB): string {
  return typeof card.descriptionPreview === 'string' ? card.descriptionPreview.trim() : '';
}

export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  const title = base === '' ? 'Untitled' : base;
  return title.slice(0, LIST_NAME_MAX_LENGTH);
}

export function captionToDescriptionJson(text: string): string {
  const trimmed = text.trim().slice(0, CARD_DESCRIPTION_TEXT_MAX_LENGTH);
  if (trimmed === '') {
    return '';
  }
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: trimmed }] }],
  });
}

export function buildStorytellingSections(
  lists: readonly ListDB[],
  cardsById: Readonly<Record<string, CardDB>>,
  cardIdsByListId: Readonly<Record<string, readonly string[]>>,
): readonly StorytellingSection[] {
  return lists.map((list) => {
    const ids = cardIdsByListId[list.id] ?? [];
    const cards: CardDB[] = [];
    for (const id of ids) {
      const card = cardsById[id];
      if (card != null) {
        cards.push(card);
      }
    }
    const { hero, content } = splitStorytellingSectionCards(cards);
    return { list, hero, content };
  });
}
