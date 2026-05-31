import type {
  WekanAttachment,
  WekanBoard,
  WekanCard,
  WekanChecklist,
  WekanComment,
  WekanExport,
  WekanLabel,
  WekanList,
  WekanUser,
} from '../types.js';
import { normalizeWekanExportData } from './exportData.js';
import { readWekanId } from './primitives.js';
import { normalizeWekanBoardRecord, normalizeWekanCardRecord, normalizeWekanListRecord } from './records.js';
import { stripToWekanBoard } from './shape.js';

export function normalizeWekanExport(raw: unknown): WekanExport {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Wekan import: expected a JSON object at the root.');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.data === 'object' && o.data !== null && !Array.isArray(o.data)) {
    return normalizeWekanExport(o.data);
  }

  if (o.board != null && typeof o.board === 'object' && !Array.isArray(o.boards)) {
    const { board, ...rest } = o;
    const normalized = normalizeWekanExport({
      ...rest,
      boards: [board as Record<string, unknown>],
    });
    if (normalized.boards.length !== 1) {
      throw new Error('Wekan import: only single-board exports are supported.');
    }
    return normalizeWekanExportData(normalized, { singleBoardIdHint: normalized.boards[0]?._id });
  }

  if (Array.isArray(o.boards) && o.boards.length > 0) {
    const boardObjects = o.boards
      .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
      .map((b) => b as Record<string, unknown>);
    const normalizedBoards = boardObjects
      .map((b) => normalizeWekanBoardRecord(stripToWekanBoard(b)))
      .filter((b): b is WekanBoard => b !== null);
    const nestedLists = boardObjects.flatMap((b) => {
      if (!Array.isArray(b.lists)) {
        return [];
      }
      return (b.lists as unknown[]).flatMap((item) => {
        if (typeof item !== 'object' || item === null) {
          return [];
        }
        const normalized = normalizeWekanListRecord(item as Record<string, unknown>, readWekanId(b._id));
        return normalized != null ? [normalized] : [];
      });
    });
    const nestedCards = boardObjects.flatMap((b) => {
      if (!Array.isArray(b.cards)) {
        return [];
      }
      return (b.cards as unknown[]).flatMap((item) => {
        if (typeof item !== 'object' || item === null) {
          return [];
        }
        const normalized = normalizeWekanCardRecord(item as Record<string, unknown>, readWekanId(b._id));
        return normalized != null ? [normalized] : [];
      });
    });
    const out: WekanExport = {
      boards: normalizedBoards,
      lists:
        Array.isArray(o.lists) && o.lists.length > 0
          ? (o.lists as unknown[]).flatMap((item) => {
              if (typeof item !== 'object' || item === null) {
                return [];
              }
              const normalized = normalizeWekanListRecord(item as Record<string, unknown>);
              return normalized != null ? [normalized] : [];
            })
          : nestedLists,
      cards:
        Array.isArray(o.cards) && o.cards.length > 0
          ? (o.cards as unknown[]).flatMap((item) => {
              if (typeof item !== 'object' || item === null) {
                return [];
              }
              const normalized = normalizeWekanCardRecord(item as Record<string, unknown>);
              return normalized != null ? [normalized] : [];
            })
          : nestedCards,
    };
    if (Array.isArray(o.labels)) {
      out.labels = o.labels as WekanLabel[];
    }
    if (Array.isArray(o.checklists)) {
      out.checklists = o.checklists as WekanChecklist[];
    }
    if (Array.isArray(o.comments)) {
      out.comments = o.comments as WekanComment[];
    }
    if (Array.isArray(o.attachments)) {
      out.attachments = o.attachments as WekanAttachment[];
    }
    if (Array.isArray(o.users)) {
      out.users = o.users as WekanUser[];
    }
    if (normalizedBoards.length !== 1) {
      throw new Error('Wekan import: only single-board exports are supported.');
    }
    return normalizeWekanExportData(out, { singleBoardIdHint: normalizedBoards[0]?._id });
  }

  const hasBoardId = readWekanId(o._id) != null;
  const hasListsArray = Array.isArray(o.lists);
  const formatLooksLikeWekan = typeof o._format === 'string' && o._format.toLowerCase().includes('wekan');
  if (hasBoardId && (hasListsArray || formatLooksLikeWekan)) {
    const singleBoard = normalizeWekanBoardRecord(stripToWekanBoard(o));
    if (singleBoard == null) {
      throw new Error('Wekan import: invalid single-board payload.');
    }
    const out: WekanExport = {
      boards: [singleBoard],
      lists: hasListsArray ? (o.lists as WekanList[]) : [],
      cards: Array.isArray(o.cards) ? (o.cards as WekanCard[]) : [],
    };
    if (Array.isArray(o.labels)) {
      out.labels = o.labels as WekanLabel[];
    }
    if (Array.isArray(o.checklists)) {
      out.checklists = o.checklists as WekanChecklist[];
    }
    if (Array.isArray(o.comments)) {
      out.comments = o.comments as WekanComment[];
    }
    if (Array.isArray(o.attachments)) {
      out.attachments = o.attachments as WekanAttachment[];
    }
    if (Array.isArray(o.users)) {
      out.users = o.users as WekanUser[];
    }
    return normalizeWekanExportData(out, { singleBoardIdHint: singleBoard._id });
  }

  throw new Error(
    'Wekan import: unrecognized JSON. Expected a single-board Wekan export (root _id/title with lists/cards) or a compatible { board, lists, cards } wrapper.',
  );
}
