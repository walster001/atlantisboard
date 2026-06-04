import mongoose from 'mongoose';
import type { ICard } from '../../../models/Card.js';
import type { TrelloNormalizedCard } from '../../../../shared/import/trelloNormalize.js';

export function resolveCardAssigneeIds(
  card: TrelloNormalizedCard,
  memberMap: ReadonlyMap<string, string>,
): mongoose.Types.ObjectId[] {
  return (
    card.idMembers
      ?.map((memberId) => {
        const mappedId = memberMap.get(memberId);
        return mappedId ? new mongoose.Types.ObjectId(mappedId) : null;
      })
      .filter((id): id is mongoose.Types.ObjectId => id !== null) ?? []
  );
}

export function resolveCardLabels(
  card: TrelloNormalizedCard,
  labelMapForBoard: ReadonlyMap<string, { id: string; name: string; color: string }> | undefined,
): ICard['labels'] {
  const labelIdList: string[] = [...(card.idLabels ?? [])];
  if (labelIdList.length === 0 && card.labels) {
    for (const label of card.labels) {
      labelIdList.push(label.id);
    }
  }
  const cardLabels: ICard['labels'] = [];
  for (const labelId of labelIdList) {
    const meta = labelMapForBoard?.get(labelId);
    if (meta) {
      cardLabels.push({ id: meta.id, name: meta.name, color: meta.color });
    }
  }
  return cardLabels;
}
