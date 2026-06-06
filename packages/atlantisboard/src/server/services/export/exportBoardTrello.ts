import { hexToTrelloColorKey } from '../../../shared/export/hexToTrelloColorKey.js';
import { spreadPosForIndex } from '../../../shared/utils/cardListPos.js';
import { encodeExportAttachments } from './encodeExportAttachment.js';
import type { BoardExportContext } from './loadBoardExportContext.js';

function cardDescriptionForTrello(descriptionPreview: string, descriptionHtml: string | undefined): string {
  const html = descriptionHtml?.trim() ?? '';
  if (html !== '') {
    return html;
  }
  return descriptionPreview.trim();
}

function resolveCardPos(card: { pos?: number; position: number }): number {
  if (typeof card.pos === 'number' && Number.isFinite(card.pos)) {
    return card.pos;
  }
  return spreadPosForIndex(card.position);
}

export async function buildTrelloExportPayload(ctx: BoardExportContext): Promise<unknown> {
  const boardId = ctx.board._id.toString();
  const labelIdByMongoId = new Map<string, string>();
  const trelloLabels = ctx.labels.map((label) => {
    const id = label._id.toString();
    labelIdByMongoId.set(id, id);
    return {
      id,
      idBoard: boardId,
      name: label.name,
      color: hexToTrelloColorKey(label.color),
    };
  });

  const cardLabelIds = (card: (typeof ctx.cards)[number]): string[] =>
    card.labels
      .map((label) => label.id)
      .filter((id) => labelIdByMongoId.has(id) || id.trim() !== '');

  const checklists: Array<Record<string, unknown>> = [];
  const trelloCards = await Promise.all(
    ctx.cards.map(async (card) => {
      const cardId = card._id.toString();
      const cardChecklistIds: string[] = [];
      for (const checklist of card.checklists) {
        const checklistId = checklist.id;
        cardChecklistIds.push(checklistId);
        checklists.push({
          id: checklistId,
          idCard: cardId,
          idBoard: boardId,
          name: checklist.title,
          checkItems: checklist.items.map((item, index) => ({
            id: item.id,
            name: item.text,
            state: item.completed ? 'complete' : 'incomplete',
            pos: spreadPosForIndex(index),
          })),
        });
      }

      const attachments = await encodeExportAttachments(card.attachments);
      return {
        id: cardId,
        name: card.title,
        desc: cardDescriptionForTrello(card.descriptionPreview, card.descriptionHtml),
        idList: card.listId.toString(),
        idBoard: boardId,
        pos: resolveCardPos(card),
        closed: false,
        due: card.dueDate != null ? new Date(card.dueDate).toISOString() : null,
        dueComplete: card.completed,
        start: card.startDate != null ? new Date(card.startDate).toISOString() : null,
        idLabels: cardLabelIds(card),
        idMembers: card.assignees.map((id) => id.toString()),
        idChecklists: cardChecklistIds,
        attachments: attachments.map((att) => ({
          id: att.id,
          name: att.name,
          url: att.url,
          mimeType: att.mimeType,
          bytes: att.size,
          date: att.uploadedAt,
        })),
        comments: card.comments.map((comment) => {
          const user = ctx.usersById.get(comment.userId.toString());
          return {
            id: comment.id,
            data: { text: comment.text },
            memberCreator: {
              ...(user?.email != null && user.email !== '' ? { email: user.email } : {}),
              fullName: user?.displayName ?? user?.username ?? 'User',
            },
            date: new Date(comment.createdAt).toISOString(),
          };
        }),
      };
    }),
  );

  return {
    id: boardId,
    name: ctx.board.name,
    desc: ctx.board.description ?? '',
    closed: false,
    lists: ctx.lists.map((list, index) => ({
      id: list._id.toString(),
      name: list.name,
      idBoard: boardId,
      pos: spreadPosForIndex(index),
      closed: false,
    })),
    cards: trelloCards,
    labels: trelloLabels,
    checklists,
    members: [...ctx.usersById.values()].map((user) => ({
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.displayName,
    })),
  };
}
