import type { WekanExport } from '../types.js';
import { readWekanId } from './primitives.js';
import {
  normalizeWekanBoardRecord,
  normalizeWekanCardRecord,
  normalizeWekanListRecord,
  normalizeWekanUserRecord,
} from './records.js';

export function normalizeWekanExportData(raw: WekanExport, options?: { singleBoardIdHint?: string }): WekanExport {
  const singleBoardIdHint = options?.singleBoardIdHint;
  const boards = (raw.boards ?? []).flatMap((b) => {
    const normalized = normalizeWekanBoardRecord(b as unknown as Record<string, unknown>);
    return normalized != null ? [normalized] : [];
  });
  const lists = (raw.lists ?? []).flatMap((l) => {
    const normalized = normalizeWekanListRecord(l as unknown as Record<string, unknown>, singleBoardIdHint);
    return normalized != null ? [normalized] : [];
  });
  const cards = (raw.cards ?? []).flatMap((c) => {
    const normalized = normalizeWekanCardRecord(c as unknown as Record<string, unknown>, singleBoardIdHint);
    return normalized != null ? [normalized] : [];
  });

  return {
    ...raw,
    boards,
    lists,
    cards,
    ...(Array.isArray(raw.users)
      ? {
          users: raw.users.flatMap((u) => {
            if (typeof u !== 'object' || u === null) {
              return [];
            }
            const normalized = normalizeWekanUserRecord(u as unknown as Record<string, unknown>);
            return normalized != null ? [normalized] : [];
          }),
        }
      : {}),
    ...(Array.isArray(raw.labels)
      ? {
          labels: raw.labels.flatMap((lab) => {
            const id = readWekanId((lab as unknown as Record<string, unknown>)._id);
            const boardId =
              readWekanId((lab as unknown as Record<string, unknown>).boardId) ??
              readWekanId((lab as unknown as Record<string, unknown>).idBoard) ??
              singleBoardIdHint;
            return id != null && boardId != null ? [{ ...lab, _id: id, boardId }] : [];
          }),
        }
      : {}),
  };
}
