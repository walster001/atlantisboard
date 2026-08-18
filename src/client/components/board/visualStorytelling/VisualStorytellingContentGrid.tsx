import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { UnstyledButton } from '@mantine/core';
import type { CardDB } from '../../../store/database.js';
import { useResponsiveTier } from '../../../hooks/useResponsiveTier.js';
import { packMasonryColumns } from './packMasonryColumns.js';
import { storytellingCaption, storytellingImageUrl } from './visualStorytellingModel.js';

const CONTENT_GAP_PX = 12;

export interface VisualStorytellingContentGridProps {
  readonly cards: readonly CardDB[];
  readonly canEdit: boolean;
  readonly onOpenCard: (card: CardDB) => void;
  readonly onImageClick?: (card: CardDB) => void;
}

export function VisualStorytellingContentGrid({
  cards,
  canEdit,
  onOpenCard,
  onImageClick,
}: VisualStorytellingContentGridProps) {
  const tier = useResponsiveTier();
  const columnCount = tier === 'desktop' ? 3 : tier === 'tablet' ? 2 : 1;
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({});
  const reportHeight = useCallback((id: string, height: number) => {
    setHeights((prev) => (prev[id] === height ? prev : { ...prev, [id]: height }));
  }, []);
  // ponytail: unknown heights=1 so first paint is LTR/round-robin; RO re-packs after images load. Store aspect ratios if the shuffle is visible.
  const columns = useMemo(
    () =>
      packMasonryColumns(
        cards.map((card) => ({ id: card.id, height: heights[card.id] ?? 1 })),
        columnCount,
      ),
    [cards, heights, columnCount],
  );
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="vs-content-grid">
      {columns.map((ids, colIndex) => (
        <div key={colIndex} className="vs-content-grid__col">
          {ids.map((id) => {
            const card = cardsById.get(id);
            if (card == null) {
              return null;
            }
            return (
              <VisualStorytellingContentCard
                key={card.id}
                card={card}
                canEdit={canEdit}
                onOpenCard={onOpenCard}
                onHeight={reportHeight}
                {...(onImageClick !== undefined ? { onImageClick } : {})}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function VisualStorytellingContentCard({
  card,
  canEdit,
  onOpenCard,
  onImageClick,
  onHeight,
}: {
  readonly card: CardDB;
  readonly canEdit: boolean;
  readonly onOpenCard: (card: CardDB) => void;
  readonly onImageClick?: (card: CardDB) => void;
  readonly onHeight: (id: string, height: number) => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (el == null) {
      return undefined;
    }
    const publish = (): void => {
      const height = el.offsetHeight;
      if (height > 0) {
        onHeight(card.id, height + CONTENT_GAP_PX);
      }
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [card.id, onHeight]);

  const imageUrl = storytellingImageUrl(card);
  const caption = storytellingCaption(card);
  const alt = caption !== '' ? `${card.title} — ${caption}` : card.title;
  const imageEnabled = imageUrl !== '';
  return (
    <article ref={rootRef} className="vs-content-card">
      <UnstyledButton
        type="button"
        className="vs-content-card__media"
        aria-label={imageEnabled ? `View ${card.title} fullscreen` : card.title}
        disabled={!imageEnabled}
        onClick={() => {
          if (imageEnabled) {
            onImageClick?.(card);
          }
        }}
      >
        {imageUrl !== '' ? (
          <img className="vs-content-card__img" src={imageUrl} alt={alt} />
        ) : (
          <span className="vs-content-card__placeholder">No image</span>
        )}
      </UnstyledButton>
      <UnstyledButton
        type="button"
        className="vs-content-card__title"
        onClick={() => onOpenCard(card)}
        aria-label={`Edit title: ${card.title}`}
      >
        {card.title}
      </UnstyledButton>
      {caption !== '' ? (
        <UnstyledButton
          type="button"
          className="vs-content-card__caption"
          onClick={() => onOpenCard(card)}
          aria-label="Edit caption"
        >
          {caption}
        </UnstyledButton>
      ) : canEdit ? (
        <UnstyledButton
          type="button"
          className="vs-content-card__add-caption"
          onClick={() => onOpenCard(card)}
        >
          Add caption
        </UnstyledButton>
      ) : null}
    </article>
  );
}
