import mongoose, { type Document } from 'mongoose';
import { Card, type ICard } from '../../models/Card.js';
import { duplicateCardAttachmentsForManyCards } from '../attachmentService.js';
import { CARD_POS_STEP } from '../../../shared/utils/cardListPos.js';
import { syncListPositionsFromPosOrder } from './positioning.js';
import {
  buildCardInsertDoc,
  finalizeDuplicatedCardFieldsFromAttachments,
} from './cardDuplicationMap.js';
import {
  computeInsertPosValuesAtTopOfList,
  maybeRenormalizeListPos,
} from './cardDuplicationLoad.js';
import type { SourceCardForDuplicate } from './cardDuplicationTypes.js';

export interface DuplicateInsertPlan {
  readonly source: SourceCardForDuplicate;
  readonly newCardId: mongoose.Types.ObjectId;
  readonly pos: number;
}

export async function buildDuplicateInsertPlans(
  sourceCards: readonly SourceCardForDuplicate[],
  targetListId: string,
  targetBoardId: string,
  userId: string,
): Promise<{
  readonly plans: readonly DuplicateInsertPlan[];
  readonly docs: readonly Record<string, unknown>[];
}> {
  const posValues = await computeInsertPosValuesAtTopOfList(targetListId, sourceCards.length);

  const plans: DuplicateInsertPlan[] = sourceCards.map((source, index) => ({
    source,
    newCardId: new mongoose.Types.ObjectId(),
    pos: posValues[index] ?? CARD_POS_STEP,
  }));

  const attachmentRowsByPlan = await duplicateCardAttachmentsForManyCards(
    plans.map((plan) => ({
      sourceAttachments: plan.source.attachments ?? [],
      newCardId: plan.newCardId.toString(),
    })),
  );

  const prepared = plans.map((plan, index) => {
    const finalized = finalizeDuplicatedCardFieldsFromAttachments(
      plan.source,
      attachmentRowsByPlan[index] ?? [],
    );
    const doc = buildCardInsertDoc(
      plan.source,
      targetListId,
      targetBoardId,
      userId,
      plan.pos,
      plan.newCardId,
      finalized,
    );
    return { source: plan.source, doc, newCardId: plan.newCardId };
  });

  return {
    plans,
    docs: prepared.map((p) => p.doc),
  };
}

export async function persistDuplicatedCards(
  targetListId: string,
  docs: readonly Record<string, unknown>[],
): Promise<(Document & ICard)[]> {
  const inserted = (await Card.insertMany(docs, { ordered: true })) as (Document & ICard)[];
  await syncListPositionsFromPosOrder(targetListId);
  await maybeRenormalizeListPos(targetListId);
  return inserted;
}
