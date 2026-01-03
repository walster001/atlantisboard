import { prisma } from '../db/client.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { permissionService } from '../lib/permissions/service.js';
import { emitDatabaseChange } from '../realtime/emitter.js';
import { boardService } from './board.service.js';

const createWorkspaceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
});

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

class WorkspaceService {
  async create(userId: string, data: z.infer<typeof createWorkspaceSchema>, isAppAdmin: boolean) {
    const validated = createWorkspaceSchema.parse(data);

    // Check app-level permission
    const context = permissionService.buildContext(userId, isAppAdmin);
    await permissionService.requirePermission('app.workspace.create', context);

    const workspace = await prisma.workspace.create({
      data: {
        name: validated.name,
        description: validated.description ?? null,
        ownerId: userId,
      },
      include: {
        owner: {
          include: {
            profile: true,
          },
        },
        members: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });

    return workspace;
  }

  async findById(userId: string, workspaceId: string) {
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
      include: {
        owner: {
          include: {
            profile: true,
          },
        },
        members: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
        boards: {
          orderBy: [
            { position: 'asc' },
            { createdAt: 'desc' },
          ],
        },
      },
    });

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    return workspace;
  }

  async findAll(userId: string) {
    const workspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
      include: {
        owner: {
          include: {
            profile: true,
          },
        },
        members: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
        boards: {
          orderBy: [
            { position: 'asc' },
            { createdAt: 'desc' },
          ],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return workspaces;
  }

  async update(userId: string, workspaceId: string, data: z.infer<typeof updateWorkspaceSchema>, isAppAdmin: boolean) {
    // Check if user is owner or app admin
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        ownerId: userId,
      },
    });

    if (!workspace && !isAppAdmin) {
      throw new ForbiddenError('Only workspace owner can update workspace');
    }

    // Check app-level permission
    const context = permissionService.buildContext(userId, isAppAdmin);
    await permissionService.requirePermission('app.workspace.edit', context);

    const validated = updateWorkspaceSchema.parse(data);

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: validated.name,
        description: validated.description,
      },
      include: {
        owner: {
          include: {
            profile: true,
          },
        },
        members: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });

    return updated;
  }

  async delete(userId: string, workspaceId: string, isAppAdmin: boolean) {
    // Check if user is owner or app admin
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        ownerId: userId,
      },
      include: {
        boards: true, // Include boards to get their IDs for cleanup
      },
    });

    if (!workspace && !isAppAdmin) {
      throw new ForbiddenError('Only workspace owner can delete workspace');
    }

    // Check app-level permission
    const context = permissionService.buildContext(userId, isAppAdmin);
    await permissionService.requirePermission('app.workspace.delete', context);

    // Delete all boards through the service to trigger cleanup
    // This ensures attachments, inline button icons, and board backgrounds are cleaned up from MinIO
    if (workspace && workspace.boards.length > 0) {
      for (const board of workspace.boards) {
        try {
          await boardService.delete(userId, board.id, isAppAdmin);
        } catch (error: any) {
          // Log error but continue deleting other boards
          // Partial cleanup is better than no cleanup
          console.error(`[Workspace Deletion] Failed to delete board ${board.id}:`, error.message);
        }
      }
    }

    // Now delete the workspace (boards should already be deleted, but cascade will handle any remaining)
    await prisma.workspace.delete({
      where: { id: workspaceId },
    });

    return { success: true };
  }

  async addMember(userId: string, workspaceId: string, memberUserId: string) {
    // Check if user is owner
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        ownerId: userId,
      },
    });

    if (!workspace) {
      throw new ForbiddenError('Only workspace owner can add members');
    }

    // Check if member already exists
    const existing = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: memberUserId,
        },
      },
    });

    if (existing) {
      throw new ValidationError('User is already a member of this workspace');
    }

    const member = await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: memberUserId,
      },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    // Emit workspace membership add event
    await emitDatabaseChange('workspaceMembers', 'INSERT', member as any, undefined);

    return member;
  }

  async removeMember(userId: string, workspaceId: string, memberUserId: string) {
    // Check if user is owner
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        ownerId: userId,
      },
    });

    if (!workspace) {
      throw new ForbiddenError('Only workspace owner can remove members');
    }

    // Cannot remove owner
    if (workspace.ownerId === memberUserId) {
      throw new ValidationError('Cannot remove workspace owner');
    }

    // Get member before deletion for event emission
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: memberUserId,
        },
      },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    await prisma.workspaceMember.delete({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: memberUserId,
        },
      },
    });

    // Emit workspace membership remove event
    if (member) {
      await emitDatabaseChange('workspaceMembers', 'DELETE', undefined, member as any);
    }

    return { success: true };
  }
}

export const workspaceService = new WorkspaceService();

