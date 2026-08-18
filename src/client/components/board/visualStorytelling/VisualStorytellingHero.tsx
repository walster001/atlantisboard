import { UnstyledButton } from '@mantine/core';
import type { CardDB, ListDB } from '../../../store/database.js';
import { storytellingCaption, storytellingImageUrl } from './visualStorytellingModel.js';

export interface VisualStorytellingHeroProps {
  readonly list: ListDB;
  readonly hero: CardDB | null;
  readonly contentCount: number;
  readonly canEdit: boolean;
  readonly onOpenCard: (card: CardDB) => void;
  readonly onImageClick?: (card: CardDB) => void;
  readonly onPickHeroImage?: () => void;
}

export function VisualStorytellingHero({
  list,
  hero,
  contentCount,
  canEdit,
  onOpenCard,
  onImageClick,
  onPickHeroImage,
}: VisualStorytellingHeroProps) {
  const title = hero?.title.trim() || list.name;
  const caption = hero != null ? storytellingCaption(hero) : '';
  const imageUrl = hero != null ? storytellingImageUrl(hero) : '';
  const alt = caption !== '' ? `${title} — ${caption}` : title;
  const labelName = hero?.labels[0]?.name?.trim() ?? '';
  const cardLabel = contentCount === 1 ? '1 Card' : `${contentCount} Cards`;
  const imageEnabled = hero != null && imageUrl !== '';

  return (
    <div className="vs-hero">
      <UnstyledButton
        type="button"
        className="vs-hero__media"
        aria-label={imageEnabled ? `View ${title} fullscreen` : canEdit ? 'Add hero image' : title}
        disabled={!imageEnabled && !(canEdit && onPickHeroImage != null)}
        onClick={() => {
          if (imageEnabled && hero != null) {
            onImageClick?.(hero);
            return;
          }
          onPickHeroImage?.();
        }}
      >
        {imageUrl !== '' ? (
          <img className="vs-hero__img" src={imageUrl} alt={alt} />
        ) : (
          <span className="vs-hero__placeholder">
            {canEdit ? 'Add hero image' : 'No hero image'}
          </span>
        )}
      </UnstyledButton>
      <div className="vs-hero__overlay">
        {hero != null ? (
          <UnstyledButton
            type="button"
            className="vs-hero__title"
            onClick={() => onOpenCard(hero)}
            aria-label={`Edit hero title: ${title}`}
          >
            {title}
          </UnstyledButton>
        ) : (
          <p className="vs-hero__title">{title}</p>
        )}
        {hero != null && caption !== '' ? (
          <UnstyledButton
            type="button"
            className="vs-hero__caption"
            onClick={() => onOpenCard(hero)}
            aria-label="Edit hero caption"
          >
            {caption}
          </UnstyledButton>
        ) : null}
        {hero != null && caption === '' && canEdit ? (
          <UnstyledButton
            type="button"
            className="vs-hero__add-caption"
            onClick={() => onOpenCard(hero)}
          >
            Add caption
          </UnstyledButton>
        ) : null}
        <p className="vs-hero__count">{cardLabel}</p>
        {labelName !== '' ? <span className="vs-hero__label">{labelName}</span> : null}
      </div>
    </div>
  );
}
