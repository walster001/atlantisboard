import { prisma } from '../db/client.js';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { permissionService } from '../lib/permissions/service.js';
import { emitDatabaseChange, emitCustomEvent } from '../realtime/emitter.js';
import { storageService } from './storage.service.js';
import { getErrorMessage } from '../lib/typeGuards.js';
import { Prisma } from '@prisma/client';

const createBoardSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  backgroundColor: z.string().optional().nullable(),
  themeId: z.string().uuid().optional().nullable(),
});

const updateBoardSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  backgroundColor: z.string().optional().nullable(),
  themeId: z.string().uuid().optional().nullable(),
});

function extractStoragePathFromUrl(url: string, bucket: string): string | null {
  if (!url) return null;
  
  // Try MinIO/S3 format first: ${prefix}-${bucket}/path
  // Look for pattern like "-branding/" or "-fonts/" etc.
  const minioPattern = `-${bucket}/`;
  const minioIndex = url.indexOf(minioPattern);
  if (minioIndex !== -1) {
    const path = url.substring(minioIndex + minioPattern.length);
    return path || null;
  }
  
  // Fall back to API proxy format: /api/storage/${bucket}/path
  const apiPattern = `/api/storage/${bucket}/`;
  const apiIndex = url.indexOf(apiPattern);
  if (apiIndex !== -1) {
    const path = url.substring(apiIndex + apiPattern.length);
    // Decode URI component in case it was encoded
    try {
      return decodeURIComponent(path) || null;
    } catch {
      return path || null;
    }
  }
  
  return null;
}

function parseInlineButtonFromDataAttr(dataAttr: string): { iconUrl?: string } | null {
  try {
    // Decode base64
    const decoded = Buffer.from(dataAttr, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function extractInlineButtonIconsFromDescription(description: string | null): string[] {
  if (!description) return [];
  
  const iconUrls: string[] = [];
  
  // Match [INLINE_BUTTON:base64data] format
  const inlineButtonRegex = /\[INLINE_BUTTON:([A-Za-z0-9+/=]+)\]/g;
  let match;
  
  while ((match = inlineButtonRegex.exec(description)) !== null) {
    const base64Data = match[1];
    const buttonData = parseInlineButtonFromDataAttr(base64Data);
    if (buttonData?.iconUrl) {
      iconUrls.push(buttonData.iconUrl);
    }
  }
  
  // Also check for legacy HTML format with img src
  const imgSrcRegex = /<img[^>]*src=['"]([^'"]+)['"][^>]*>/gi;
  while ((match = imgSrcRegex.exec(description)) !== null) {
    const src = match[1];
    // Only include if it looks like a storage URL (contains /cdn, /api/storage, or storage endpoint)
    if (src.includes('/cdn') || src.includes('/api/storage') || src.includes('inline-icon') || src.includes('import-icons')) {
      iconUrls.push(src);
    }
  }
  
  return iconUrls;
}

class BoardService {
  // Check if user is board member or app admin
  async checkBoardAccess(userId: string, boardId: string, isAppAdmin: boolean): Promise<boolean> {
    if (isAppAdmin) {
      return true;
    }

    const membership = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId,
        },
      },
    });

    return !!membership;
  }

  // Get user's role on board
  private async getUserRole(userId: string, boardId: string, isAppAdmin: boolean): Promise<'admin' | 'manager' | 'viewer' | null> {
    if (isAppAdmin) {
      return 'admin';
    }

    const membership = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId,
        },
      },
    });

    return membership?.role ?? null;
  }

  // Get complete board data (replaces get_board_data function)
  async getBoardData(userId: string, boardId: string, isAppAdmin: boolean) {
    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('board.view', context);

    // Get board
    const board = await prisma.board.findUnique({
      where: { id: boardId },
    });

    if (!board) {
      throw new NotFoundError('Board not found');
    }

    // Get user role
    const userRole = await this.getUserRole(userId, boardId, isAppAdmin);

    // Get columns (ordered by position)
    const columns = await prisma.column.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
    });

    // Get all cards in these columns
    const columnIds = columns.map((c: { id: string }) => c.id);
    const cards = await prisma.card.findMany({
      where: {
        columnId: { in: columnIds },
      },
      orderBy: [
        { columnId: 'asc' },
        { position: 'asc' },
      ],
      include: {
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

    // Get labels
    const labels = await prisma.label.findMany({
      where: { boardId },
    });

    // Get card labels (many-to-many)
    const cardLabels = await prisma.cardLabel.findMany({
      where: {
        cardId: { in: cards.map((c: { id: string }) => c.id) },
      },
    });

    // Get board members with profiles
    const members = await prisma.boardMember.findMany({
      where: { boardId },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    // Format members (hide email unless self or app admin)
    const formattedMembers = members.map((member: { userId: string; role: string; user: { email: string; profile?: { id: string; fullName: string | null; avatarUrl: string | null } | null } }) => ({
      userId: member.userId,
      role: member.role,
      profiles: {
        id: member.user.profile?.id ?? member.userId,
        email: userId === member.userId || isAppAdmin ? member.user.email : null,
        fullName: member.user.profile?.fullName ?? null,
        avatarUrl: member.user.profile?.avatarUrl ?? null,
      },
    }));

    return {
      board: {
        id: board.id,
        name: board.name,
        description: board.description,
        backgroundColor: board.backgroundColor,
        workspaceId: board.workspaceId,
        createdBy: board.createdBy, // Include creator ID for frontend validation
      },
      userRole: userRole,
      columns,
      cards,
      labels,
      cardLabels: cardLabels,
      members: formattedMembers,
    };
  }

  async create(userId: string, data: z.infer<typeof createBoardSchema>, isAppAdmin: boolean) {
    const validated = createBoardSchema.parse(data);

    // Check app-level permission to create boards
    const appContext = permissionService.buildContext(userId, isAppAdmin);
    await permissionService.requirePermission('app.board.create', appContext);

    // Check if user has access to workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: validated.workspaceId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
    });

    if (!workspace) {
      throw new ForbiddenError('Access denied to workspace');
    }

    // Get max position for new board
    const maxPosition = await prisma.board.aggregate({
      where: { workspaceId: validated.workspaceId },
      _max: { position: true },
    });

    const board = await prisma.board.create({
      data: {
        workspaceId: validated.workspaceId,
        name: validated.name,
        description: validated.description ?? null,
        backgroundColor: validated.backgroundColor ?? null,
        themeId: validated.themeId ?? null,
        position: (maxPosition._max.position ?? -1) + 1,
        createdBy: userId, // Set board creator
      },
    });

    // Add creator as admin member
    await prisma.boardMember.create({
      data: {
        boardId: board.id,
        userId,
        role: 'admin',
      },
    });

    // Emit create event
    await emitDatabaseChange('boards', 'INSERT', board, undefined, board.id);

    return board;
  }

  async findById(userId: string, boardId: string, isAppAdmin: boolean) {
    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('board.view', context);

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        workspace: true,
        theme: true,
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

    if (!board) {
      throw new NotFoundError('Board not found');
    }

    return board;
  }

  async findAll(userId: string, isAppAdmin: boolean) {
    const boards = await prisma.board.findMany({
      where: isAppAdmin
        ? {}
        : {
            members: {
              some: { userId },
            },
          },
      include: {
        workspace: true,
        theme: true,
      },
      orderBy: [
        { workspaceId: 'asc' },
        { position: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return boards;
  }

  async update(userId: string, boardId: string, data: z.infer<typeof updateBoardSchema>, isAppAdmin: boolean) {
    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('board.edit', context);

    const validated = updateBoardSchema.parse(data);

    const updated = await prisma.board.update({
      where: { id: boardId },
      data: {
        name: validated.name,
        description: validated.description,
        backgroundColor: validated.backgroundColor,
        themeId: validated.themeId,
      },
    });

    return updated;
  }

  async delete(userId: string, boardId: string, isAppAdmin: boolean) {
    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin, boardId);
    await permissionService.requirePermission('board.delete', context);

    // Get full board data with all related data before deletion
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        columns: {
          include: {
            cards: {
              include: {
                attachments: true,
              },
            },
          },
        },
      },
    });

    if (!board) {
      throw new NotFoundError('Board not found');
    }

    // Clean up MinIO files before deleting the board
    if (storageService.isConfigured()) {
      try {
        const filesToDelete: Array<{ bucket: string; path: string }> = [];

        // Collect all card attachments
        for (const column of board.columns) {
          for (const card of column.cards) {
            // Add attachments
            for (const attachment of card.attachments) {
              const storagePath = extractStoragePathFromUrl(attachment.fileUrl, 'card-attachments');
              if (storagePath) {
                filesToDelete.push({ bucket: 'card-attachments', path: storagePath });
              }
            }

            // Extract inline button icons from card description
            const iconUrls = extractInlineButtonIconsFromDescription(card.description);
            for (const iconUrl of iconUrls) {
              // Determine bucket based on path pattern
              let bucket = 'branding';
              let storagePath: string | null = null;

              // Check if it's an import icon or inline icon
              if (iconUrl.includes('import-icons/')) {
                storagePath = extractStoragePathFromUrl(iconUrl, 'branding');
              } else if (iconUrl.includes('inline-icons/')) {
                storagePath = extractStoragePathFromUrl(iconUrl, 'branding');
              } else {
                // Try to extract from URL
                storagePath = extractStoragePathFromUrl(iconUrl, 'branding');
              }

              if (storagePath) {
                filesToDelete.push({ bucket, path: storagePath });
              }
            }
          }
        }

        // Check for board background image
        if (board.backgroundColor) {
          // Board backgrounds are stored in branding bucket with pattern board-backgrounds/{boardId}-bg-{timestamp}.{ext}
          // The backgroundColor field might contain the full URL or just the path
          const bgPath = extractStoragePathFromUrl(board.backgroundColor, 'branding');
          if (bgPath && bgPath.includes('board-backgrounds/')) {
            filesToDelete.push({ bucket: 'branding', path: bgPath });
          }
        }

        // Delete all collected files (log errors but don't fail board deletion)
        for (const file of filesToDelete) {
          try {
            await storageService.delete(file.bucket, file.path);
            console.log(`[Board Deletion] Deleted file: ${file.bucket}/${file.path}`);
          } catch (error: unknown) {
            // Log error but continue with deletion
            console.error(`[Board Deletion] Failed to delete file ${file.bucket}/${file.path}:`, getErrorMessage(error));
          }
        }

        console.log(`[Board Deletion] Cleaned up ${filesToDelete.length} files from MinIO for board ${boardId}`);
      } catch (error: unknown) {
        // Log error but don't fail board deletion if cleanup fails
        console.error(`[Board Deletion] Error during MinIO cleanup for board ${boardId}:`, getErrorMessage(error));
      }
    }

    await prisma.board.delete({
      where: { id: boardId },
    });

    // Emit DELETE event for realtime subscriptions
    await emitDatabaseChange('boards', 'DELETE', undefined, board, boardId);

    // Emit custom event to workspace channel
    if (board.workspaceId) {
      await emitCustomEvent(`workspace:${board.workspaceId}`, 'board.removed', {
        boardId,
        workspaceId: board.workspaceId,
      });
    }

    return { success: true };
  }

  async updatePosition(userId: string, boardId: string, newPosition: number, newWorkspaceId?: string, isAppAdmin?: boolean) {
    // Check permission
    const context = permissionService.buildContext(userId, isAppAdmin ?? false, boardId);
    await permissionService.requirePermission('board.move', context);

    const updateData: Prisma.BoardUpdateInput = {
      position: newPosition,
    };

    if (newWorkspaceId) {
      // Verify access to new workspace
      const workspace = await prisma.workspace.findFirst({
        where: {
          id: newWorkspaceId,
          OR: [
            { ownerId: userId },
            { members: { some: { userId } } },
          ],
        },
      });

      if (!workspace) {
        throw new ForbiddenError('Access denied to target workspace');
      }

      updateData.workspaceId = newWorkspaceId;
    }

    // Get old board before update
    const oldBoard = await prisma.board.findUnique({ where: { id: boardId } });
    
    const updated = await prisma.board.update({
      where: { id: boardId },
      data: updateData,
    });

    // Emit update event
    // Type assertion necessary: emitDatabaseChange expects Record<string, unknown> for generic table support
    await emitDatabaseChange('boards', 'UPDATE', updated as Record<string, unknown>, oldBoard as Record<string, unknown>, boardId);

    return updated;
  }
}

export const boardService = new BoardService();

