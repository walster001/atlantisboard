import type { WekanExport } from '../types.js';
import { objectToRecord } from '../../../../utils/objectRecord.js';
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
    const normalized = normalizeWekanBoardRecord(objectToRecord(b));
    return normalized != null ? [normalized] : [];
  });
  const lists = (raw.lists ?? []).flatMap((l) => {
    const normalized = normalizeWekanListRecord(objectToRecord(l), singleBoardIdHint);
    return normalized != null ? [normalized] : [];
  });
  const cards = (raw.cards ?? []).flatMap((c) => {
    const normalized = normalizeWekanCardRecord(objectToRecord(c), singleBoardIdHint);
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
            const normalized = normalizeWekanUserRecord(objectToRecord(u));
            return normalized != null ? [normalized] : [];
          }),
        }
      : {}),
    ...(Array.isArray(raw.labels)
      ? {
          labels: raw.labels.flatMap((lab) => {
            const labRecord = objectToRecord(lab);
            const id = readWekanId(labRecord._id);
            const boardId =
              readWekanId(labRecord.boardId) ??
              readWekanId(labRecord.idBoard) ??
              singleBoardIdHint;
            return id != null && boardId != null ? [{ ...lab, _id: id, boardId }] : [];
          }),
        }
      : {}),
  };
}
