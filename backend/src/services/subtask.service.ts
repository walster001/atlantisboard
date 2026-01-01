import { prisma } from '../db/client.js';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { cardService } from './card.service.js';
import { permissionService } from '../lib/permissions/service.js';
import { emitDatabaseChange } from '../realtime/emitter.js';

const createSubtaskSchema = z.object({
  cardId: z.string().uuid(),
  title: z.string().min(1),
  checklistName: z.string().optional().nullable(),
  position: z.number().optional(),
});

const updateSubtaskSchema = z.object({
  title: z.string().min(1).optional(),
  completed: z.boolean().optional(),
  checklistName: z.string().optional().nullable(),
  position: z.number().optional(),
});

class SubtaskService {
  async create(userId: string, data: z.infer<typeof createSubtaskSchema>, isAppAdmin: boolean) {
    const validated = createSubtaskSchema.parse(data);

    // Get card to check permission
    const card = await prisma.card.findUnique({
      where: { id: validated.cardId },
      include: { column: true },
    });

    if (!card) {
      throw new NotFoundError('Card not found');
    }

    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, card.column.boardId);
    await permissionService.requirePermission('subtask.create', context);

    // Get max position if not provided
    let position = validated.position;
    if (position === undefined) {
      const maxPosition = await prisma.cardSubtask.aggregate({
        where: { cardId: validated.cardId },
        _max: { position: true },
      });
      position = (maxPosition._max.position ?? -1) + 1;
    }

    const subtask = await prisma.cardSubtask.create({
      data: {
        cardId: validated.cardId,
        title: validated.title,
        checklistName: validated.checklistName ?? null,
        position,
      },
    });

    // Emit create event
    await emitDatabaseChange('card_subtasks', 'INSERT', subtask as any, undefined, card.column.boardId);

    return subtask;
  }

  async update(userId: string, subtaskId: string, data: z.infer<typeof updateSubtaskSchema>, isAppAdmin: boolean) {
    const subtask = await prisma.cardSubtask.findUnique({
      where: { id: subtaskId },
      include: {
        card: {
          include: { column: true },
        },
      },
    });

    if (!subtask) {
      throw new NotFoundError('Subtask not found');
    }

    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, subtask.card.column.boardId);
    if (validated.completed !== undefined) {
      await permissionService.requirePermission('subtask.toggle', context);
    } else {
      await permissionService.requirePermission('subtask.create', context);
    }

    const validated = updateSubtaskSchema.parse(data);

    const updateData: any = {
      title: validated.title,
      checklistName: validated.checklistName,
      position: validated.position,
    };

    if (validated.completed !== undefined) {
      updateData.completed = validated.completed;
      if (validated.completed) {
        updateData.completedAt = new Date();
        updateData.completedBy = userId;
      } else {
        updateData.completedAt = null;
        updateData.completedBy = null;
      }
    }

    const updated = await prisma.cardSubtask.update({
      where: { id: subtaskId },
      data: updateData,
    });

    // Emit update event
    await emitDatabaseChange('card_subtasks', 'UPDATE', updated as any, subtask as any, subtask.card.column.boardId);

    return updated;
  }

  async delete(userId: string, subtaskId: string, isAppAdmin: boolean) {
    const subtask = await prisma.cardSubtask.findUnique({
      where: { id: subtaskId },
      include: {
        card: {
          include: { column: true },
        },
      },
    });

    if (!subtask) {
      throw new NotFoundError('Subtask not found');
    }

    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, subtask.card.column.boardId);
    await permissionService.requirePermission('subtask.delete', context);

    await prisma.cardSubtask.delete({
      where: { id: subtaskId },
    });

    // Emit delete event
    await emitDatabaseChange('card_subtasks', 'DELETE', undefined, subtask as any, subtask.card.column.boardId);

    return { success: true };
  }
}

export const subtaskService = new SubtaskService();

