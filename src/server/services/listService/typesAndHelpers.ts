import mongoose from 'mongoose';
import { List } from '../../models/List.js';
import {
  compareBoardListOrder,
  spreadListPosForIndex,
} from '../../../shared/utils/listPos.js';

export interface CreateListInput {
  boardId: string;
  name: string;
  position?: number | undefined;
}

export interface UpdateListInput {
  name?: string | undefined;
  position?: number | undefined;
  color?: string | undefined;
}

export type ListPosLeanRow = { _id: mongoose.Types.ObjectId; pos?: number; position: number };

export function sortListRowsByPos(rows: readonly ListPosLeanRow[]): ListPosLeanRow[] {
  return [...rows].sort((a, b) =>
    compareBoardListOrder(
      {
        ...(typeof a.pos === 'number' && Number.isFinite(a.pos) ? { pos: a.pos } : {}),
        position: a.position,
        id: a._id.toString(),
      },
      {
        ...(typeof b.pos === 'number' && Number.isFinite(b.pos) ? { pos: b.pos } : {}),
        position: b.position,
        id: b._id.toString(),
      },
    ),
  );
}

export async function ensureListsHavePosForBoard(boardId: string | mongoose.Types.ObjectId): Promise<void> {
  const bid = typeof boardId === 'string' ? boardId : boardId.toString();
  const anyMissing = await List.exists({
    boardId: bid,
    $or: [{ pos: { $exists: false } }, { pos: null }],
  });
  if (!anyMissing) {
    return;
  }
  const lists = await List.find({ boardId: bid }).sort({ position: 1, _id: 1 }).lean();
  const bulkOps = lists.map((l, i) => ({
    updateOne: {
      filter: { _id: l._id },
      update: { $set: { pos: spreadListPosForIndex(i), position: i } },
    },
  }));
  if (bulkOps.length > 0) {
    await List.bulkWrite(bulkOps, { ordered: false });
  }
}

export async function syncBoardListPositionsFromPosOrder(boardId: string | mongoose.Types.ObjectId): Promise<void> {
  const bid = typeof boardId === 'string' ? boardId : boardId.toString();
  const rows = sortListRowsByPos(
    await List.find({ boardId: bid }).select('pos position').lean<ListPosLeanRow[]>(),
  );
  const updates = rows
    .map((row, i) => ({ row, i }))
    .filter(({ row, i }) => row.position !== i);
  if (updates.length === 0) {
    return;
  }
  const bulkOps = updates.map(({ row, i }) => ({
    updateOne: {
      filter: { _id: row._id },
      update: { $set: { position: i } },
    },
  }));
  if (bulkOps.length > 0) {
    await List.bulkWrite(bulkOps, { ordered: false });
  }
}

export async function normalizeBoardListPosSpread(boardId: string | mongoose.Types.ObjectId): Promise<{
  orderedListIds: string[];
  orderedPos: number[];
}> {
  const bid = typeof boardId === 'string' ? boardId : boardId.toString();
  const rows = sortListRowsByPos(
    await List.find({ boardId: bid }).select('pos position').lean<ListPosLeanRow[]>(),
  );
  const orderedListIds = rows.map((r) => r._id.toString());
  const orderedPos = rows.map((_, i) => spreadListPosForIndex(i));
  const rowNumericPos = (r: ListPosLeanRow): number =>
    typeof r.pos === 'number' && Number.isFinite(r.pos) ? r.pos : spreadListPosForIndex(r.position);
  const updates = rows
    .map((r, i) => ({ r, i, nextPos: orderedPos[i]! }))
    .filter(({ r, i: idx, nextPos }) => r.position !== idx || rowNumericPos(r) !== nextPos);
  if (updates.length > 0) {
    const bulkOps = updates.map(({ r, i, nextPos }) => ({
      updateOne: {
        filter: { _id: r._id },
        update: { $set: { pos: nextPos, position: i } },
      },
    }));
    await List.bulkWrite(bulkOps, { ordered: false });
  }
  return { orderedListIds, orderedPos };
}

export function rowNumericPos(r: ListPosLeanRow): number {
  return typeof r.pos === 'number' && Number.isFinite(r.pos) ? r.pos : spreadListPosForIndex(r.position);
}

export { insertListPosBetween, listPosGapTooSmall, listPosNeedsNormalize, spreadListPosForIndex, LIST_POS_STEP } from '../../../shared/utils/listPos.js';
