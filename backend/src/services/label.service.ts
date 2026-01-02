import { prisma } from '../db/client.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { permissionService } from '../lib/permissions/service.js';
import { emitDatabaseChange } from '../realtime/emitter.js';

const createLabelSchema = z.object({
  boardId: z.string().uuid(),
  name: z.string().min(1),
  color: z.string(),
});

const updateLabelSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
});

class LabelService {
  async create(userId: string, data: z.infer<typeof createLabelSchema>, isAppAdmin: boolean) {
    const validated = createLabelSchema.parse(data);

    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, validated.boardId);
    await permissionService.requirePermission('label.create', context);

    const label = await prisma.label.create({
      data: {
        boardId: validated.boardId,
        name: validated.name,
        color: validated.color,
      },
    });

    // Emit create event
    await emitDatabaseChange('labels', 'INSERT', label as any, undefined, validated.boardId);

    return label;
  }

  async findAll(userId: string, boardId: string, isAppAdmin: boolean) {
    // Check board access
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('board.view', context);

    const labels = await prisma.label.findMany({
      where: { boardId },
    });

    return labels;
  }

  async update(userId: string, labelId: string, data: z.infer<typeof updateLabelSchema>, isAppAdmin: boolean) {
    const label = await prisma.label.findUnique({
      where: { id: labelId },
    });

    if (!label) {
      throw new NotFoundError('Label not found');
    }

    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, label.boardId);
    await permissionService.requirePermission('label.edit', context);

    const validated = updateLabelSchema.parse(data);

    const updated = await prisma.label.update({
      where: { id: labelId },
      data: {
        name: validated.name,
        color: validated.color,
      },
    });

    // Emit update event
    await emitDatabaseChange('labels', 'UPDATE', updated as any, label as any, label.boardId);

    return updated;
  }

  async delete(userId: string, labelId: string, isAppAdmin: boolean) {
    const label = await prisma.label.findUnique({
      where: { id: labelId },
    });

    if (!label) {
      throw new NotFoundError('Label not found');
    }

    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, label.boardId);
    await permissionService.requirePermission('label.delete', context);

    await prisma.label.delete({
      where: { id: labelId },
    });

    // Emit delete event
    await emitDatabaseChange('labels', 'DELETE', undefined, label as any, label.boardId);

    return { success: true };
  }

  // Assign label to card
  async assignToCard(userId: string, cardId: string, labelId: string, isAppAdmin: boolean) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: { column: true },
    });

    if (!card) {
      throw new NotFoundError('Card not found');
    }

    const label = await prisma.label.findUnique({
      where: { id: labelId },
    });

    if (!label) {
      throw new NotFoundError('Label not found');
    }

    // Verify label belongs to same board
    if (label.boardId !== card.column.boardId) {
      throw new ValidationError('Label does not belong to the same board as the card');
    }

    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, card.column.boardId);
    await permissionService.requirePermission('label.assign', context);

    const cardLabel = await prisma.cardLabel.create({
      data: {
        cardId,
        labelId,
      },
    });

    // Emit create event
    await emitDatabaseChange('card_labels', 'INSERT', cardLabel as any, undefined, card.column.boardId);

    return cardLabel;
  }

  // Remove label from card
  async removeFromCard(userId: string, cardId: string, labelId: string, isAppAdmin: boolean) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: { column: true },
    });

    if (!card) {
      throw new NotFoundError('Card not found');
    }

    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, card.column.boardId);
    await permissionService.requirePermission('label.unassign', context);

    // Get existing cardLabel for old value
    const existingCardLabel = await prisma.cardLabel.findUnique({
      where: {
        cardId_labelId: {
          cardId,
          labelId,
        },
      },
    });

    await prisma.cardLabel.delete({
      where: {
        cardId_labelId: {
          cardId,
          labelId,
        },
      },
    });

    // Emit delete event
    if (existingCardLabel) {
      await emitDatabaseChange('card_labels', 'DELETE', undefined, existingCardLabel as any, card.column.boardId);
    }

    return { success: true };
  }
}

export const labelService = new LabelService();

