import crypto from 'node:crypto';
import type { ICard } from '../../../models/Card.js';
import type {
  NormalizedTrelloExport,
  TrelloNormalizedCard,
  TrelloNormalizedChecklist,
} from '../../../../shared/import/trelloNormalize.js';

export function trelloImportAttachmentMimeType(mime: string | null | undefined): string {
  const t = typeof mime === 'string' ? mime.trim() : '';
  return t.length > 0 ? t : 'application/octet-stream';
}

export function buildChecklistsByCardId(
  data: NormalizedTrelloExport,
): Map<string, TrelloNormalizedChecklist[]> {
  const map = new Map<string, TrelloNormalizedChecklist[]>();
  for (const cl of data.checklists) {
    const list = map.get(cl.idCard) ?? [];
    list.push(cl);
    map.set(cl.idCard, list);
  }
  return map;
}

export function buildCardChecklists(
  trelloCard: TrelloNormalizedCard,
  checklistsByCardId: Map<string, TrelloNormalizedChecklist[]>,
): ICard['checklists'] {
  const pool = checklistsByCardId.get(trelloCard.id) ?? [];
  const ids = trelloCard.idChecklists ?? [];
  const ordered: TrelloNormalizedChecklist[] =
    ids.length > 0
      ? ids
          .map((id) => pool.find((c) => c.id === id))
          .filter((c): c is TrelloNormalizedChecklist => c != null)
      : [...pool];

  const fromRoot: ICard['checklists'] = ordered.map((checklist) => ({
    id: crypto.randomUUID(),
    title: checklist.name,
    items: (checklist.checkItems ?? []).map((item, idx) => {
      const done = item.state === 'complete';
      const base = {
        id: crypto.randomUUID(),
        text: item.name.slice(0, 5000),
        completed: done,
        sortOrder: idx,
      };
      return done ? { ...base, completedAt: new Date() } : base;
    }),
  }));

  if (fromRoot.length > 0) {
    return fromRoot;
  }

  const legacy = trelloCard.checklists ?? [];
  return legacy.map((checklist) => ({
    id: crypto.randomUUID(),
    title: checklist.name,
    items: (checklist.checkItems ?? []).map((item, idx) => {
      const done = item.state === 'complete';
      const base = {
        id: crypto.randomUUID(),
        text: item.name.slice(0, 5000),
        completed: done,
        sortOrder: idx,
      };
      return done ? { ...base, completedAt: new Date() } : base;
    }),
  }));
}

export function resolveTrelloCoverImageUrl(
  cover: Record<string, unknown> | undefined,
  attachments: TrelloNormalizedCard['attachments'] | undefined,
): string | undefined {
  if (cover == null) {
    return undefined;
  }
  for (const key of ['url', 'previewUrl'] as const) {
    const v = cover[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      return v.trim();
    }
  }
  const idAtt = cover.idAttachment;
  if (typeof idAtt === 'string' && attachments) {
    const att = attachments.find((a) => a.id === idAtt);
    if (att != null && typeof att.url === 'string' && att.url.trim().length > 0) {
      return att.url.trim();
    }
  }
  return undefined;
}
