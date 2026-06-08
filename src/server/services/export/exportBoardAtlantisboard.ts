import { ATLANTISBOARD_EXPORT_FORMAT_VERSION } from '../../../shared/export/boardExportFormats.js';
import { enrichAtlantisboardExportUsers } from '../../../shared/export/enrichAtlantisboardExportUsers.js';
import { logger } from '../../utils/logger.js';
import {
  collectImportInlineObjectNamesFromText,
  getImportInlineObjectStream,
} from '../importInlineAssetService.js';
import { streamChunkToBuffer } from '../../utils/streamChunkToBuffer.js';
import { encodeExportAttachments } from './encodeExportAttachment.js';
import type { BoardExportContext } from './loadBoardExportContext.js';

interface InlineAssetEntry {
  readonly dataUrl: string;
  readonly contentType: string;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(streamChunkToBuffer(chunk));
  }
  return Buffer.concat(chunks);
}

async function extractInlineAssets(
  cards: ReadonlyArray<{ description?: string | undefined; descriptionHtml?: string | undefined }>,
): Promise<Record<string, InlineAssetEntry>> {
  const objectNames = new Set<string>();
  for (const card of cards) {
    collectImportInlineObjectNamesFromText(card.description, objectNames);
    collectImportInlineObjectNamesFromText(card.descriptionHtml, objectNames);
  }

  if (objectNames.size === 0) {
    return {};
  }

  const assets: Record<string, InlineAssetEntry> = {};
  for (const name of objectNames) {
    try {
      const result = await getImportInlineObjectStream(name);
      if (result == null) {
        logger.warn({ objectName: name }, 'Inline asset not found in MinIO during export, skipping');
        continue;
      }
      const buffer = await streamToBuffer(result.stream);
      const safeMime = result.contentType.trim() !== '' ? result.contentType : 'application/octet-stream';
      assets[name] = {
        dataUrl: `data:${safeMime};base64,${buffer.toString('base64')}`,
        contentType: safeMime,
      };
    } catch (error: unknown) {
      logger.warn({ error, objectName: name }, 'Failed to read inline asset for export, skipping');
    }
  }
  return assets;
}

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

  const inlineAssets = await extractInlineAssets(cards);

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
    users: enrichAtlantisboardExportUsers(ctx.usersById.values(), {
      ownerId: ctx.board.ownerId.toString(),
      members: ctx.board.members,
    }),
    inlineAssets,
    exportedAt: new Date().toISOString(),
  };
}
