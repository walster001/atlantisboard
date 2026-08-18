import { Button } from '@mantine/core';
import type { CardDB, ListDB } from '../../../store/database.js';
import { VisualStorytellingHero } from './VisualStorytellingHero.js';
import { VisualStorytellingContentGrid } from './VisualStorytellingContentGrid.js';

export interface VisualStorytellingSectionProps {
  readonly list: ListDB;
  readonly hero: CardDB | null;
  readonly content: readonly CardDB[];
  readonly canAddCard: boolean;
  readonly canEdit: boolean;
  readonly busy: boolean;
  readonly onOpenCard: (card: CardDB) => void;
  readonly onImageClick: (card: CardDB) => void;
  readonly onAddContent: (listId: string) => void;
  readonly onPickHeroImage: (listId: string) => void;
}

export function VisualStorytellingSection({
  list,
  hero,
  content,
  canAddCard,
  canEdit,
  busy,
  onOpenCard,
  onImageClick,
  onAddContent,
  onPickHeroImage,
}: VisualStorytellingSectionProps) {
  return (
    <section className="vs-section" aria-label={list.name}>
      <VisualStorytellingHero
        list={list}
        hero={hero}
        contentCount={content.length}
        canEdit={canEdit}
        onOpenCard={onOpenCard}
        onImageClick={onImageClick}
        {...(canAddCard ? { onPickHeroImage: () => onPickHeroImage(list.id) } : {})}
      />
      <VisualStorytellingContentGrid
        cards={content}
        canEdit={canEdit}
        onOpenCard={onOpenCard}
        onImageClick={onImageClick}
      />
      {canAddCard ? (
        <Button
          type="button"
          variant="outline"
          color="gray"
          radius="xl"
          className="vs-add-content"
          disabled={busy}
          onClick={() => onAddContent(list.id)}
        >
          + Add content
        </Button>
      ) : null}
    </section>
  );
}
