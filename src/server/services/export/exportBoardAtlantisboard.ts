import { ATLANTISBOARD_EXPORT_FORMAT_VERSION } from '../../../shared/export/boardExportFormats.js';
import { encodeExportAttachments } from './encodeExportAttachment.js';
import type { BoardExportContext } from './loadBoardExportContext.js';

export async function buildAtlantisboardExportPayload(ctx: BoardExportContext): Promise<unknown> {
  const boardId = ctx.board._id.toString();
  const cards = await Promise.all(
    ctx.cards.map(async (card) => ({
      id: card._id.toString(),
      listId: card.listId.toString(),
      title: card.title,
      description: card.description,
      descriptionHtml: card.descriptionHtml,
      descriptionPreview: card.descriptionPreview,
      descriptionCharCount: card.descriptionCharCount,
      position: card.position,
      pos: card.pos,
      color: card.color,
      cover: card.cover,
      labels: card.labels,
      dueDate: card.dueDate,
      startDate: card.startDate,
      endDate: card.endDate,
      completed: card.completed,
      completedAt: card.completedAt,
      assignees: card.assignees.map((id) => id.toString()),
      reminders: card.reminders,
      checklists: card.checklists,
      comments: card.comments.map((comment) => ({
        id: comment.id,
        userId: comment.userId.toString(),
        text: comment.text,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      })),
      attachments: await encodeExportAttachments(card.attachments),
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
      createdBy: card.createdBy.toString(),
    })),
  );

  return {
    format: ATLANTISBOARD_EXPORT_FORMAT_VERSION,
    board: {
      id: boardId,
      name: ctx.board.name,
      description: ctx.board.description,
      background: ctx.board.background,
      visibility: ctx.board.visibility,
      settings: ctx.board.settings,
      ownerId: ctx.board.ownerId.toString(),
      members: ctx.board.members.map((member) => ({
        userId: member.userId.toString(),
        roleKey: member.roleKey,
        addedAt: member.addedAt,
      })),
    },
    lists: ctx.lists.map((list) => ({
      id: list._id.toString(),
      name: list.name,
      position: list.position,
      color: list.color,
    })),
    cards,
    labels: ctx.labels.map((label) => ({
      id: label._id.toString(),
      name: label.name,
      color: label.color,
      isPredefined: label.isPredefined,
    })),
    users: [...ctx.usersById.values()],
    exportedAt: new Date().toISOString(),
  };
}
