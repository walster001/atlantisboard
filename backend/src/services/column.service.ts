import { prisma } from '../db/client.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { boardService } from './board.service.js';
import { permissionService } from '../lib/permissions/service.js';
import { emitDatabaseChange } from '../realtime/emitter.js';

const createColumnSchema = z.object({
  boardId: z.string().uuid(),
  title: z.string().min(1),
  color: z.string().optional().nullable(),
  position: z.number().optional(),
});

const updateColumnSchema = z.object({
  title: z.string().min(1).optional(),
  color: z.string().optional().nullable(),
  position: z.number().optional(),
});

class ColumnService {
  async create(userId: string, data: z.infer<typeof createColumnSchema>, isAppAdmin: boolean) {
    const validated = createColumnSchema.parse(data);

    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, validated.boardId);
    await permissionService.requirePermission('column.create', context);

    // Get max position if not provided
    let position = validated.position;
    if (position === undefined) {
      const maxPosition = await prisma.column.aggregate({
        where: { boardId: validated.boardId },
        _max: { position: true },
      });
      position = (maxPosition._max.position ?? -1) + 1;
    }

    const column = await prisma.column.create({
      data: {
        boardId: validated.boardId,
        title: validated.title,
        color: validated.color ?? null,
        position,
      },
    });

    // Emit create event
    await emitDatabaseChange('columns', 'INSERT', column as any, undefined, validated.boardId);

    return column;
  }

  async findById(userId: string, columnId: string, isAppAdmin: boolean) {
    const column = await prisma.column.findUnique({
      where: { id: columnId },
      include: {
        board: true,
        cards: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!column) {
      throw new NotFoundError('Column not found');
    }

    // Check board access
    const context = permissionService.buildContext(userId, isAppAdmin, column.boardId);
    await permissionService.requirePermission('board.view', context);

    return column;
  }

  async findAll(userId: string, boardId: string, isAppAdmin: boolean) {
    // Check board access
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('board.view', context);

    const columns = await prisma.column.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
      include: {
        cards: {
          orderBy: { position: 'asc' },
        },
      },
    });

    return columns;
  }

  async update(userId: string, columnId: string, data: z.infer<typeof updateColumnSchema>, isAppAdmin: boolean) {
    const column = await prisma.column.findUnique({
      where: { id: columnId },
    });

    if (!column) {
      throw new NotFoundError('Column not found');
    }

    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, column.boardId);
    await permissionService.requirePermission('column.edit', context);

    const validated = updateColumnSchema.parse(data);

    const updated = await prisma.column.update({
      where: { id: columnId },
      data: {
        title: validated.title,
        color: validated.color,
        position: validated.position,
      },
    });

    // Emit update event
    await emitDatabaseChange('columns', 'UPDATE', updated as any, column as any, column.boardId);

    return updated;
  }

  async delete(userId: string, columnId: string, isAppAdmin: boolean) {
    const column = await prisma.column.findUnique({
      where: { id: columnId },
    });

    if (!column) {
      throw new NotFoundError('Column not found');
    }

    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, column.boardId);
    await permissionService.requirePermission('column.delete', context);

    await prisma.column.delete({
      where: { id: columnId },
    });

    // Emit delete event
    await emitDatabaseChange('columns', 'DELETE', undefined, column as any, column.boardId);

    return { success: true };
  }

  async reorder(userId: string, boardId: string, updates: Array<{ id: string; position: number }>, isAppAdmin: boolean) {
    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('column.reorder', context);

    // Get existing columns for old values
    const existingColumns = await prisma.column.findMany({
      where: { id: { in: updates.map((u) => u.id) } },
    });

    // Update all positions in transaction
    await prisma.$transaction(
      updates.map((update) =>
        prisma.column.update({
          where: { id: update.id },
          data: { position: update.position },
        })
      )
    );

    // Emit update events for each column
    for (const update of updates) {
      const oldColumn = existingColumns.find((c) => c.id === update.id);
      if (oldColumn) {
        const updated = await prisma.column.findUnique({ where: { id: update.id } });
        if (updated) {
          await emitDatabaseChange('columns', 'UPDATE', updated as any, oldColumn as any, oldColumn.boardId);
        }
      }
    }

    return { success: true };
  }
}

export const columnService = new ColumnService();

