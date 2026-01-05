import { prisma } from '../db/client.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { permissionService } from '../lib/permissions/service.js';
import { emitDatabaseChange } from '../realtime/emitter.js';
import { Prisma } from '@prisma/client';

const createCardSchema = z.object({
  columnId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  priority: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  position: z.number().optional(),
});

const updateCardSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  priority: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  position: z.number().optional(),
  columnId: z.string().uuid().optional(),
});

class CardService {

  // Get board ID from column
  private async getBoardIdFromColumn(columnId: string): Promise<string> {
    const column = await prisma.column.findUnique({
      where: { id: columnId },
      select: { boardId: true },
    });

    if (!column) {
      throw new NotFoundError('Column not found');
    }

    return column.boardId;
  }

  async create(userId: string, data: z.infer<typeof createCardSchema>, isAppAdmin: boolean) {
    const validated = createCardSchema.parse(data);

    // Get board ID and check permission
    const boardId = await this.getBoardIdFromColumn(validated.columnId);
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('card.create', context);

    // Get max position if not provided
    let position = validated.position;
    if (position === undefined) {
      const maxPosition = await prisma.card.aggregate({
        where: { columnId: validated.columnId },
        _max: { position: true },
      });
      position = (maxPosition._max.position ?? -1) + 1;
    }

    const card = await prisma.card.create({
      data: {
        columnId: validated.columnId,
        title: validated.title,
        description: validated.description ?? null,
        color: validated.color ?? null,
        priority: validated.priority ?? null,
        dueDate: validated.dueDate ? new Date(validated.dueDate) : null,
        position,
        createdBy: userId,
      },
      include: {
        column: true,
        assignees: true,
        subtasks: true,
        attachments: true,
        labels: {
          include: {
            label: true,
          },
        },
      },
    });

    // Emit create event
    await emitDatabaseChange('cards', 'INSERT', card, undefined, card.column.boardId);

    return card;
  }

  async findById(userId: string, cardId: string, isAppAdmin: boolean) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: {
        column: {
          include: {
            board: true,
          },
        },
        assignees: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
        subtasks: {
          orderBy: { position: 'asc' },
        },
        attachments: true,
        labels: {
          include: {
            label: true,
          },
        },
      },
    });

    if (!card) {
      throw new NotFoundError('Card not found');
    }

    // Check board access
    const context = permissionService.buildContext(userId, isAppAdmin, card.column.boardId);
    await permissionService.requirePermission('board.view', context);

    return card;
  }

  async update(userId: string, cardId: string, data: z.infer<typeof updateCardSchema>, isAppAdmin: boolean) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: {
        column: true,
      },
    });

    if (!card) {
      throw new NotFoundError('Card not found');
    }

    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, card.column.boardId);
    await permissionService.requirePermission('card.edit', context);

    const validated = updateCardSchema.parse(data);

    const updateData: Prisma.CardUpdateInput = {
      title: validated.title,
      description: validated.description,
      color: validated.color,
      priority: validated.priority,
      position: validated.position,
    };

    if (validated.dueDate !== undefined) {
      updateData.dueDate = validated.dueDate ? new Date(validated.dueDate) : null;
    }

    if (validated.columnId && validated.columnId !== card.columnId) {
      // Moving to different column - verify it's in same board
      const newColumn = await prisma.column.findUnique({
        where: { id: validated.columnId },
      });

      if (!newColumn || newColumn.boardId !== card.column.boardId) {
        throw new ValidationError('Cannot move card to column in different board');
      }

      updateData.columnId = validated.columnId;
    }

    const updated = await prisma.card.update({
      where: { id: cardId },
      data: updateData,
      include: {
        assignees: true,
        subtasks: true,
        attachments: true,
        labels: {
          include: {
            label: true,
          },
        },
      },
    });

    // Emit update event
    await emitDatabaseChange('cards', 'UPDATE', updated, card, card.column.boardId);

    return updated;
  }

  async delete(userId: string, cardId: string, isAppAdmin: boolean) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: {
        column: true,
      },
    });

    if (!card) {
      throw new NotFoundError('Card not found');
    }

    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, card.column.boardId);
    await permissionService.requirePermission('card.delete', context);

    await prisma.card.delete({
      where: { id: cardId },
    });

    // Emit delete event
    await emitDatabaseChange('cards', 'DELETE', undefined, card, card.column.boardId);

    return { success: true };
  }

  async reorder(userId: string, updates: Array<{ id: string; columnId: string; position: number }>, isAppAdmin: boolean) {
    // Verify all cards are accessible and user has permission
    const cardIds = updates.map((u) => u.id);
    const cards = await prisma.card.findMany({
      where: { id: { in: cardIds } },
      include: {
        column: true,
      },
    });

    // Group by board and check permissions
    const boardIds = [...new Set(cards.map((c: { column: { boardId: string } }) => c.column.boardId))];
    for (const boardId of boardIds) {
      const context = permissionService.buildContext(userId, isAppAdmin, boardId as string);
      await permissionService.requirePermission('card.move', context);
    }

    // Get existing cards for old values
    const existingCards = await prisma.card.findMany({
      where: { id: { in: updates.map((u) => u.id) } },
      include: { column: true },
    });

    // Update all positions in transaction
    await prisma.$transaction(
      updates.map((update) =>
        prisma.card.update({
          where: { id: update.id },
          data: {
            position: update.position,
            columnId: update.columnId,
          },
        })
      )
    );

    // Emit update events for each card
    for (const update of updates) {
      const oldCard = existingCards.find((c: { id: string }) => c.id === update.id);
      if (oldCard) {
        const updated = await prisma.card.findUnique({ where: { id: update.id }, include: { column: true } });
        if (updated) {
          // Type assertion necessary: emitDatabaseChange expects Record<string, unknown> for generic table support
          await emitDatabaseChange('cards', 'UPDATE', updated as Record<string, unknown>, oldCard as Record<string, unknown>, updated.column.boardId);
        }
      }
    }

    return { success: true };
  }

  async batchUpdateColor(userId: string, boardId: string, cardIds: string[], color: string | null, isAppAdmin: boolean) {
    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('card.edit', context);

    // Verify all cards belong to the board
    const cards = await prisma.card.findMany({
      where: { id: { in: cardIds } },
      include: {
        column: true,
      },
    });

    // Verify all cards are in the specified board
    const invalidCards = cards.filter((c) => c.column.boardId !== boardId);
    if (invalidCards.length > 0) {
      throw new ValidationError('Some cards do not belong to the specified board');
    }

    // Get existing cards for old values
    const existingCards = await prisma.card.findMany({
      where: { id: { in: cardIds } },
      include: { column: true },
    });

    // Generate shared timestamp for all updates
    const sharedTimestamp = new Date();

    // Update all cards in transaction with shared timestamp
    await prisma.$transaction(
      cardIds.map((cardId) =>
        prisma.card.update({
          where: { id: cardId },
          data: {
            color,
            updatedAt: sharedTimestamp,
          },
        })
      )
    );

    // Emit update events for each card with identical timestamps
    for (const cardId of cardIds) {
      const oldCard = existingCards.find((c) => c.id === cardId);
      if (oldCard) {
        const updated = await prisma.card.findUnique({ 
          where: { id: cardId },
          include: { column: true },
        });
        if (updated) {
          // Type assertion necessary: emitDatabaseChange expects Record<string, unknown> for generic table support
          await emitDatabaseChange('cards', 'UPDATE', updated as Record<string, unknown>, oldCard as Record<string, unknown>, boardId);
        }
      }
    }

    return { success: true, updatedAt: sharedTimestamp.toISOString() };
  }

  // Card assignees
  async addAssignee(userId: string, cardId: string, assigneeUserId: string, isAppAdmin: boolean) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: { column: true },
    });

    if (!card) {
      throw new NotFoundError('Card not found');
    }

    const context = permissionService.buildContext(userId, isAppAdmin, card.column.boardId);
    await permissionService.requirePermission('card.edit', context);

    const assignee = await prisma.cardAssignee.create({
      data: {
        cardId,
        userId: assigneeUserId,
        assignedBy: userId,
      },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    return assignee;
  }

  async removeAssignee(userId: string, cardId: string, assigneeUserId: string, isAppAdmin: boolean) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: { column: true },
    });

    if (!card) {
      throw new NotFoundError('Card not found');
    }

    const context = permissionService.buildContext(userId, isAppAdmin, card.column.boardId);
    await permissionService.requirePermission('card.edit', context);

    await prisma.cardAssignee.delete({
      where: {
        cardId_userId: {
          cardId,
          userId: assigneeUserId,
        },
      },
    });

    return { success: true };
  }
}

export const cardService = new CardService();

