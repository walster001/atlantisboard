import mongoose, { type Document } from 'mongoose';
import { Card, type ICard } from '../../models/Card.js';
import { List, type IList } from '../../models/List.js';
import { Board } from '../../models/Board.js';
import { hasPermission, isBoardMember } from '../../utils/permissions.js';
import {
  toCardDetail,
  toCardSummary,
  type CardViewMode,
} from '../cardViewService.js';
import type { CardDetailDTO, CardSummaryDTO } from '../../../shared/types/viewModels.js';
import { compareCardListOrder } from '../../../shared/utils/cardListPos.js';
import { compareBoardListOrder } from '../../../shared/utils/listPos.js';
import type { CardDescriptionFieldRow } from './types.js';

export async function getCardById(
  cardId: string,
  userId: string,
  options?: { view?: CardViewMode },
): Promise<((Document & ICard) | CardDetailDTO) | null> {
  const card = await Card.findById(cardId);
  if (!card) {
    return null;
  }
  const allowed = await hasPermission({ id: userId }, card.boardId.toString(), 'cards.view');
  if (!allowed) {
    throw new Error('Insufficient permissions to view card');
  }
  void options;
  return toCardDetail(card);
}

export async function getCardsByList(
  listId: string,
  userId: string,
  options?: { view?: CardViewMode; fields?: string[] },
): Promise<Array<(Document & ICard) | CardSummaryDTO>> {
  const list = await List.findById(listId).select('boardId').lean();
  if (!list) {
    throw new Error('List not found');
  }
  const allowed = await hasPermission({ id: userId }, String(list.boardId), 'cards.view');
  if (!allowed) {
    throw new Error('Insufficient permissions to view cards');
  }
  const cardsLean = await Card.find({ listId }).lean<ICard[]>();
  cardsLean.sort((a, b) =>
    compareCardListOrder(
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
  const cards = cardsLean;
  if (options?.view === 'summary') {
    const summaries = cards.map((card) => toCardSummary(card as unknown as ICard));
    if (Array.isArray(options.fields) && options.fields.length > 0) {
      return summaries.map((summary) => {
        const selected: Record<string, unknown> = {};
        for (const field of options.fields ?? []) {
          if (field in summary) {
            selected[field] = (summary as unknown as Record<string, unknown>)[field];
          }
        }
        selected.id = summary.id;
        selected.listId = summary.listId;
        selected.boardId = summary.boardId;
        return selected as unknown as CardSummaryDTO;
      });
    }
    return summaries;
  }
  return cards;
}

export async function getBoardKanbanSnapshot(
  boardId: string,
  options?: { listLimit?: number },
): Promise<{ lists: Array<Document & IList>; cardsByList: Record<string, CardSummaryDTO[]> }> {
  const lists = await List.find({ boardId });
  lists.sort((a, b) =>
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
  const cardsByList: Record<string, CardSummaryDTO[]> = {};
  for (const list of lists) {
    const query = Card.find({ listId: list._id }).sort({ pos: 1, position: 1, _id: 1 });
    if (typeof options?.listLimit === 'number' && options.listLimit > 0) {
      query.limit(options.listLimit);
    }
    const cards = await query;
    cardsByList[list._id.toString()] = cards.map((card) => toCardSummary(card));
  }
  return { lists, cardsByList };
}

const BOARD_CARD_DESCRIPTION_BATCH_MAX = 200;

export async function getCardDescriptionFieldsBatchForBoard(
  boardId: string,
  userId: string,
  cardIds: readonly string[],
): Promise<CardDescriptionFieldRow[]> {
  const board = await Board.findById(boardId);
  if (!board) {
    throw new Error('Board not found');
  }
  const canAccess =
    board.ownerId.toString() === userId ||
    (await isBoardMember(userId, boardId)) ||
    board.visibility === 'public';
  if (!canAccess) {
    throw new Error('Insufficient permissions to view board cards');
  }

  const unique = [...new Set(cardIds.map((id) => id.trim()).filter((id) => id !== ''))];
  const capped = unique.slice(0, BOARD_CARD_DESCRIPTION_BATCH_MAX);
  const oids = capped
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (oids.length === 0) {
    return [];
  }

  const docs = await Card.find({
    boardId,
    _id: { $in: oids },
  }).select('_id description descriptionHtml');

  return docs.map((c) => {
    const id = c._id.toString();
    const description = typeof c.description === 'string' ? c.description : '';
    const descriptionHtml =
      typeof c.descriptionHtml === 'string' && c.descriptionHtml.trim() !== ''
        ? c.descriptionHtml
        : undefined;
    return descriptionHtml === undefined ? { id, description } : { id, description, descriptionHtml };
  });
}
