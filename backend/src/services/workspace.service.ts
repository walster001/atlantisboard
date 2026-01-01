import { prisma } from '../db/client.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { permissionService } from '../lib/permissions/service.js';

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
    });

    if (!workspace && !isAppAdmin) {
      throw new ForbiddenError('Only workspace owner can delete workspace');
    }

    // Check app-level permission
    const context = permissionService.buildContext(userId, isAppAdmin);
    await permissionService.requirePermission('app.workspace.delete', context);

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

    await prisma.workspaceMember.delete({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: memberUserId,
        },
      },
    });

    return { success: true };
  }
}

export const workspaceService = new WorkspaceService();

