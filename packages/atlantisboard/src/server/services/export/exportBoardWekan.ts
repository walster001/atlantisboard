import { encodeExportAttachments } from './encodeExportAttachment.js';
import type { BoardExportContext } from './loadBoardExportContext.js';

function cardDescriptionForWekan(descriptionHtml: string | undefined, descriptionPreview: string): string {
  const html = descriptionHtml?.trim() ?? '';
  if (html !== '') {
    return html;
  }
  const text = descriptionPreview.trim();
  return text === '' ? '' : `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
}

export async function buildWekanExportPayload(ctx: BoardExportContext): Promise<unknown> {
  const boardId = ctx.board._id.toString();
  const wekanLabels = ctx.labels.map((label) => ({
    _id: label._id.toString(),
    name: label.name,
    color: label.color,
    boardId,
  }));

  const labelIdsByNameColor = new Map(wekanLabels.map((label) => [`${label.name}\0${label.color}`, label._id]));

  const wekanChecklists: Array<Record<string, unknown>> = [];
  const wekanComments: Array<Record<string, unknown>> = [];
  const wekanAttachments: Array<Record<string, unknown>> = [];

  const wekanCards = await Promise.all(
    ctx.cards.map(async (card) => {
      const cardId = card._id.toString();
      for (const checklist of card.checklists) {
        wekanChecklists.push({
          _id: checklist.id,
          title: checklist.title,
          cardId,
          items: checklist.items.map((item, index) => ({
            _id: item.id,
            title: item.text,
            sortOrder: index,
            isFinished: item.completed,
            ...(item.completedAt != null ? { finishedAt: new Date(item.completedAt).toISOString() } : {}),
          })),
        });
      }

      for (const comment of card.comments) {
        wekanComments.push({
          _id: comment.id,
          cardId,
          text: comment.text,
          userId: comment.userId.toString(),
          createdAt: new Date(comment.createdAt).toISOString(),
          modifiedAt: new Date(comment.updatedAt).toISOString(),
        });
      }

      const encodedAttachments = await encodeExportAttachments(card.attachments);
      for (const attachment of encodedAttachments) {
        wekanAttachments.push({
          _id: attachment.id,
          cardId,
          name: attachment.name,
          url: attachment.url,
          type: attachment.mimeType,
          size: attachment.size,
          userId: attachment.uploadedBy,
          uploadedAt: attachment.uploadedAt,
        });
      }

      const labelIds = card.labels
        .map((label) => labelIdsByNameColor.get(`${label.name}\0${label.color}`) ?? label.id)
        .filter((id) => id.trim() !== '');

      return {
        _id: cardId,
        title: card.title,
        description: cardDescriptionForWekan(card.descriptionHtml, card.descriptionPreview),
        listId: card.listId.toString(),
        boardId,
        sort: card.position,
        archived: false,
        color: card.color,
        dueAt: card.dueDate != null ? new Date(card.dueDate).toISOString() : undefined,
        startAt: card.startDate != null ? new Date(card.startDate).toISOString() : undefined,
        finishedAt: card.completedAt != null ? new Date(card.completedAt).toISOString() : undefined,
        cover: card.cover,
        members: card.assignees.map((id) => id.toString()),
        labelIds,
        createdAt: new Date(card.createdAt).toISOString(),
        modifiedAt: new Date(card.updatedAt).toISOString(),
      };
    }),
  );

  return {
    boards: [
      {
        _id: boardId,
        title: ctx.board.name,
        description: ctx.board.description ?? '',
        archived: false,
        background: ctx.board.background,
        permission: ctx.board.visibility === 'public' ? 'public' : 'private',
      },
    ],
    lists: ctx.lists.map((list) => ({
      _id: list._id.toString(),
      title: list.name,
      boardId,
      sort: list.position,
      archived: false,
      color: list.color,
    })),
    cards: wekanCards,
    labels: wekanLabels,
    checklists: wekanChecklists,
    comments: wekanComments,
    attachments: wekanAttachments,
    users: [...ctx.usersById.values()].map((user) => ({
      _id: user.id,
      username: user.username,
      emails: user.email !== '' ? [{ address: user.email, verified: true }] : [],
      profile: { fullname: user.displayName },
    })),
  };
}
