import type { Router } from 'express';
import { z } from 'zod';
import {
  accountCapabilitiesFromFlags,
  isAccountCapabilityKey,
} from '../../../shared/accountCapabilities.js';
import type { AuthenticatedRequest } from '../../types/express.js';
import { Activity } from '../../models/Activity.js';
import { BackupJob } from '../../models/BackupJob.js';
import { Board } from '../../models/Board.js';
import { BoardLabel } from '../../models/BoardLabel.js';
import { Card } from '../../models/Card.js';
import { ImportJob } from '../../models/ImportJob.js';
import { InviteLink } from '../../models/InviteLink.js';
import { Notification } from '../../models/Notification.js';
import { PermissionSet } from '../../models/PermissionSet.js';
import { Session } from '../../models/Session.js';
import { User } from '../../models/User.js';
import { Workspace } from '../../models/Workspace.js';
import { mapUserAccountCapabilityFlags } from '../../services/accountCapabilitiesService.js';
import { deleteUserAvatar } from '../../services/userAvatarService.js';
import { logAuditEvent } from '../../utils/auditLogger.js';
import { revokeAllTokensForUser } from '../../utils/jwtBlocklist.js';
import { jwtExpiresInSeconds } from '../../utils/jwt.js';
import {
  emitPermissionsUpdated,
  removeTargetUserFromBoardMemberships,
  removeTargetUserFromWorkspaceMemberships,
} from './helpers.js';

const objectIdParamSchema = z.string().trim().regex(/^[a-fA-F0-9]{24}$/);

const ADMIN_USERS_MAX_LIMIT = 200;
type AdminUserAuthProvider = 'password' | 'google' | 'google+password' | 'none';

interface AdminUserListRow {
  readonly _id: string;
  readonly displayName: string;
  readonly email: string;
  readonly username: string;
  readonly isAppAdmin: boolean;
  readonly createdAt: string;
  readonly lastLogin?: string;
  readonly emailVerified: boolean;
  readonly authProvider: AdminUserAuthProvider;
  readonly canImportBoards: boolean;
  readonly canCreateWorkspace: boolean;
}

const accountCapabilitiesUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        userId: objectIdParamSchema,
        canImportBoards: z.boolean(),
        canCreateWorkspace: z.boolean(),
      }),
    )
    .min(1)
    .max(200),
});

function resolveAuthProvider(row: {
  readonly googleId: string | undefined;
  readonly passwordHash: string | undefined;
}): AdminUserAuthProvider {
  const hasGoogle = typeof row.googleId === 'string' && row.googleId.trim() !== '';
  const hasPassword = typeof row.passwordHash === 'string' && row.passwordHash.trim() !== '';
  if (hasGoogle && hasPassword) {
    return 'google+password';
  }
  if (hasGoogle) {
    return 'google';
  }
  if (hasPassword) {
    return 'password';
  }
  return 'none';
}

function decodeSkipCursor(cursor: string | undefined): number {
  if (cursor === undefined || cursor === '') {
    return 0;
  }
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function encodeSkipCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function registerUsersRoutes(router: Router): void {
  router.get('/users', async (req, res, next) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(ADMIN_USERS_MAX_LIMIT, Math.max(1, limitRaw))
        : 80;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : '';
      const offset = decodeSkipCursor(cursor);

      const filter: Record<string, unknown> = { isPlaceholder: { $ne: true } };
      if (q !== '') {
        const re = new RegExp(escapeRegex(q), 'i');
        filter.$or = [{ displayName: re }, { email: re }, { username: re }];
      }

      const rows = await User.find(filter)
        .select(
          '_id displayName email username isAppAdmin createdAt lastLogin emailVerified accountCapabilities googleId +passwordHash',
        )
        .sort({ displayName: 1, email: 1, _id: 1 })
        .skip(offset)
        .limit(limit)
        .lean();

      const users: AdminUserListRow[] = rows.map((u) => {
        const capabilityFlags = mapUserAccountCapabilityFlags(
          Array.isArray(u.accountCapabilities) ? u.accountCapabilities : [],
          u.isAppAdmin === true,
        );
        return {
          _id: String(u._id),
          displayName: u.displayName,
          email: u.email,
          username: u.username,
          isAppAdmin: u.isAppAdmin === true,
          createdAt: u.createdAt.toISOString(),
          ...(u.lastLogin instanceof Date ? { lastLogin: u.lastLogin.toISOString() } : {}),
          emailVerified: u.emailVerified === true,
          authProvider: resolveAuthProvider({ googleId: u.googleId, passwordHash: u.passwordHash }),
          canImportBoards: capabilityFlags.canImportBoards,
          canCreateWorkspace: capabilityFlags.canCreateWorkspace,
        };
      });
      const nextCursor = users.length === limit ? encodeSkipCursor(offset + limit) : undefined;
      res.json({ users, ...(nextCursor !== undefined ? { nextCursor } : {}) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/users/account-capabilities', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { updates } = accountCapabilitiesUpdateSchema.parse(req.body);
      const affectedUserIds: string[] = [];

      for (const update of updates) {
        const target = await User.findById(update.userId)
          .select('_id displayName isAppAdmin accountCapabilities')
          .lean();
        if (!target) {
          res.status(404).json({
            error: {
              message: `User not found: ${update.userId}`,
              code: 'NOT_FOUND',
              statusCode: 404,
            },
          });
          return;
        }
        if (target.isAppAdmin === true) {
          continue;
        }

        const nextCapabilities = accountCapabilitiesFromFlags({
          canImportBoards: update.canImportBoards,
          canCreateWorkspace: update.canCreateWorkspace,
        });
        const sanitized = nextCapabilities.filter((key) => isAccountCapabilityKey(key));

        await User.updateOne({ _id: target._id }, { $set: { accountCapabilities: sanitized } });
        affectedUserIds.push(String(target._id));

        logAuditEvent({
          userId: authReq.user.id,
          action: 'admin_user.account_capabilities.update',
          resourceType: 'user',
          resourceId: String(target._id),
          metadata: {
            targetDisplayName: target.displayName,
            canImportBoards: update.canImportBoards,
            canCreateWorkspace: update.canCreateWorkspace,
          },
          ipAddress: req.ip || undefined,
          timestamp: new Date(),
        });
      }

      if (affectedUserIds.length > 0) {
        emitPermissionsUpdated({
          affectedUserIds,
          reason: 'account_capabilities.updated',
        });
      }

      res.json({ updatedCount: affectedUserIds.length, affectedUserIds });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            errors: error.issues,
          },
        });
        return;
      }
      next(error);
    }
  });

  router.delete('/users/:id', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = objectIdParamSchema.parse(req.params.id);
      if (id === authReq.user.id) {
        res.status(403).json({
          error: {
            message: 'You cannot delete your own account from Admin Configuration.',
            code: 'FORBIDDEN',
            statusCode: 403,
          },
        });
        return;
      }

      const targetUser = await User.findById(id).select('_id displayName email isAppAdmin').lean();
      if (!targetUser) {
        res.status(404).json({
          error: {
            message: 'User not found',
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }

      const ownsWorkspace = await Workspace.exists({ ownerId: id });
      if (ownsWorkspace) {
        res.status(409).json({
          error: {
            message: 'Cannot delete a user who owns one or more workspaces.',
            code: 'CONFLICT',
            statusCode: 409,
          },
        });
        return;
      }
      const ownsBoard = await Board.exists({ ownerId: id });
      if (ownsBoard) {
        res.status(409).json({
          error: {
            message: 'Cannot delete a user who owns one or more boards.',
            code: 'CONFLICT',
            statusCode: 409,
          },
        });
        return;
      }

      const [removedWorkspaceMemberships, removedBoardMemberships] = await Promise.all([
        removeTargetUserFromWorkspaceMemberships({
          targetUserId: id,
          actingAdminId: authReq.user.id,
          targetDisplayName: targetUser.displayName,
          ipAddress: req.ip || undefined,
        }),
        removeTargetUserFromBoardMemberships({
          targetUserId: id,
          actingAdminId: authReq.user.id,
          targetDisplayName: targetUser.displayName,
          ipAddress: req.ip || undefined,
        }),
      ]);

      const [
        deletedSessions,
        deletedNotifications,
        deletedImportJobs,
        deletedBackupJobs,
        deletedPermissionSets,
        deletedInvites,
        deletedBoardLabels,
        deletedActivities,
        removedHomeWorkspaceRefs,
        removedCardEmbeddedRefs,
        reassignedCards,
        deletedUserResult,
      ] = await Promise.all([
        Session.deleteMany({ userId: id }),
        Notification.deleteMany({ userId: id }),
        ImportJob.deleteMany({ userId: id }),
        BackupJob.deleteMany({ userId: id }),
        PermissionSet.deleteMany({ createdBy: id }),
        InviteLink.deleteMany({ createdBy: id }),
        BoardLabel.deleteMany({ createdBy: id }),
        Activity.deleteMany({ userId: id }),
        User.updateMany({}, { $pull: { 'preferences.homeWorkspaceOrder': id } }),
        Card.updateMany(
          {},
          { $pull: { assignees: id, comments: { userId: id }, attachments: { uploadedBy: id } } },
        ),
        Card.updateMany({ createdBy: id }, { $set: { createdBy: authReq.user.id } }),
        revokeAllTokensForUser(id, jwtExpiresInSeconds()).then(() => User.deleteOne({ _id: id })),
        deleteUserAvatar(id),
      ]);

      logAuditEvent({
        userId: authReq.user.id,
        action: 'admin_user.delete',
        resourceType: 'user',
        resourceId: id,
        metadata: {
          deletedDisplayName: targetUser.displayName,
          deletedEmail: targetUser.email,
          removedWorkspaceMemberships,
          removedBoardMemberships,
        },
        ipAddress: req.ip || undefined,
        timestamp: new Date(),
      });

      emitPermissionsUpdated({
        affectedUserIds: [id],
        reason: 'user.deleted',
      });

      res.status(200).json({
        deletedUserId: id,
        stats: {
          removedWorkspaceMemberships,
          removedBoardMemberships,
          deletedSessions: deletedSessions.deletedCount ?? 0,
          deletedNotifications: deletedNotifications.deletedCount ?? 0,
          deletedImportJobs: deletedImportJobs.deletedCount ?? 0,
          deletedBackupJobs: deletedBackupJobs.deletedCount ?? 0,
          deletedPermissionSets: deletedPermissionSets.deletedCount ?? 0,
          deletedInvites: deletedInvites.deletedCount ?? 0,
          deletedBoardLabels: deletedBoardLabels.deletedCount ?? 0,
          deletedActivities: deletedActivities.deletedCount ?? 0,
          removedHomeWorkspaceRefs: removedHomeWorkspaceRefs.modifiedCount ?? 0,
          removedCardEmbeddedRefs: removedCardEmbeddedRefs.modifiedCount ?? 0,
          reassignedCreatedCards: reassignedCards.modifiedCount ?? 0,
          deletedUserRecords: deletedUserResult.deletedCount ?? 0,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            errors: error.issues,
          },
        });
        return;
      }
      next(error);
    }
  });
}
