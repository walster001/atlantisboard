import { lazy } from 'react';
import type { CardDB } from '../../../store/database.js';
import { CARD_DETAIL_MODAL_BACKGROUND_HEX } from '../cardDetailSectionUi.js';

export const CardDescriptionEditor = lazy(async () => {
  const m = await import('../CardDescriptionEditor.js');
  return { default: m.CardDescriptionEditor };
});

export const CardDetailViewScrollSections = lazy(async () => {
  const m = await import('../CardDetailViewScrollSections.js');
  return { default: m.CardDetailViewScrollSections };
});

let cardDescriptionEditorModulePromise: Promise<typeof import('../CardDescriptionEditor.js')> | undefined;
let cardDetailSectionsModulePromise:
  | Promise<typeof import('../CardDetailViewScrollSections.js')>
  | undefined;

export function preloadCardDetailViewPanels(): void {
  if (cardDescriptionEditorModulePromise === undefined) {
    cardDescriptionEditorModulePromise = import('../CardDescriptionEditor.js');
  }
  if (cardDetailSectionsModulePromise === undefined) {
    cardDetailSectionsModulePromise = import('../CardDetailViewScrollSections.js');
  }
}

export const CARD_DETAIL_MODAL_STYLES = {
  body: {
    padding: 0,
    backgroundColor: CARD_DETAIL_MODAL_BACKGROUND_HEX,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
  },
  content: {
    width: '54vw',
    minWidth: '44vw',
    maxWidth: '62vw',
    height: 'calc(100vh - 24px)',
    minHeight: 'calc(100vh - 24px)',
    maxHeight: 'calc(100vh - 24px)',
    backgroundColor: CARD_DETAIL_MODAL_BACKGROUND_HEX,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: { backgroundColor: CARD_DETAIL_MODAL_BACKGROUND_HEX, alignItems: 'center' },
  title: { flex: 1, marginRight: 0, width: '100%', maxWidth: '100%' },
} as const;

export function toDatetimeLocalValue(d: Date): string {
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
}

function cardUpdatedAtMs(c: CardDB): number {
  try {
    return new Date(c.updatedAt).getTime();
  } catch {
    return 0;
  }
}

export function shouldAcceptIncomingCard(current: CardDB, incoming: CardDB): boolean {
  const incomingTs = cardUpdatedAtMs(incoming);
  const currentTs = cardUpdatedAtMs(current);
  if (incomingTs > currentTs) {
    const currentHasDescription = (current.description ?? '').trim() !== '';
    if (currentHasDescription && incoming.description === undefined) {
      return false;
    }
    return true;
  }

  const detailScore = (card: CardDB): number => {
    let score = 0;
    if ((card.description ?? '').trim() !== '') score += 1;
    if (card.attachments.length > 0) score += 1;
    if (card.comments.length > 0) score += 1;
    if (card.checklists.length > 0) score += 1;
    if (card.reminders.length > 0) score += 1;
    if (card.endDate != null) score += 1;
    return score;
  };

  return detailScore(incoming) > detailScore(current);
}
