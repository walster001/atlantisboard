import mongoose from 'mongoose';
import { Card } from '../../models/Card.js';
import { CARD_POS_STEP, spreadPosForIndex } from '../../../shared/utils/cardListPos.js';

export type CardPosLeanRow = { _id: mongoose.Types.ObjectId; pos?: number; position: number };

export function sortCardRowsByPos(rows: readonly CardPosLeanRow[]): CardPosLeanRow[] {
  return [...rows].sort((a, b) => {
    const ap =
      typeof a.pos === 'number' && Number.isFinite(a.pos) ? a.pos : (a.position + 1) * CARD_POS_STEP;
    const bp =
      typeof b.pos === 'number' && Number.isFinite(b.pos) ? b.pos : (b.position + 1) * CARD_POS_STEP;
    if (ap !== bp) {
      return ap - bp;
    }
    return String(a._id).localeCompare(String(b._id));
  });
}

export async function ensureCardsHavePosForList(
  listId: string | mongoose.Types.ObjectId,
): Promise<void> {
  const lid = typeof listId === 'string' ? listId : listId.toString();
  const anyMissing = await Card.exists({
    listId: lid,
    $or: [{ pos: { $exists: false } }, { pos: null }],
  });
  if (!anyMissing) {
    return;
  }
  const cards = await Card.find({ listId: lid }).sort({ position: 1, _id: 1 }).lean();
  const bulkOps = cards.map((c, i) => ({
    updateOne: {
      filter: { _id: c._id },
      update: { $set: { pos: spreadPosForIndex(i), position: i } },
    },
  }));
  if (bulkOps.length > 0) {
    await Card.bulkWrite(bulkOps, { ordered: false });
  }
}

export async function syncListPositionsFromPosOrder(
  listId: string | mongoose.Types.ObjectId,
): Promise<void> {
  const lid = typeof listId === 'string' ? listId : listId.toString();
  const rows = sortCardRowsByPos(
    await Card.find({ listId: lid }).select('pos position').lean<CardPosLeanRow[]>(),
  );
  const bulkOps = rows.map((row, i) => ({
    updateOne: {
      filter: { _id: row._id },
      update: { $set: { position: i } },
    },
  }));
  if (bulkOps.length > 0) {
    await Card.bulkWrite(bulkOps, { ordered: false });
  }
}

export async function normalizeListPosSpread(
  listId: string | mongoose.Types.ObjectId,
): Promise<{ orderedIds: string[]; orderedPos: number[] }> {
  const lid = typeof listId === 'string' ? listId : listId.toString();
  const rows = sortCardRowsByPos(
    await Card.find({ listId: lid }).select('pos position').lean<CardPosLeanRow[]>(),
  );
  const orderedIds = rows.map((r) => r._id.toString());
  const orderedPos = rows.map((_, i) => spreadPosForIndex(i));
  const bulkOps = rows.map((r, i) => ({
    updateOne: {
      filter: { _id: r._id },
      update: { $set: { pos: orderedPos[i], position: i } },
    },
  }));
  if (bulkOps.length > 0) {
    await Card.bulkWrite(bulkOps, { ordered: false });
  }
  return { orderedIds, orderedPos };
}
