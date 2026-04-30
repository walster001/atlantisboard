import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { requireAuth, requireAppAdmin } from '../middleware/auth.js';
import { apiRateLimiter, fileUploadRateLimiter } from '../middleware/rateLimit.js';
import type { AuthenticatedRequest } from '../../shared/types/express.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import {
  getAdminConfig,
  updateAdminConfig,
  sanitizeAdminConfigForClient,
  isExternalMysqlCredentialsStored,
} from '../services/adminService.js';
import { PermissionSet } from '../models/PermissionSet.js';
import {
  testExternalMySQLConnection,
  splitMysqlHostInput,
  decryptOptionalCredential,
  DEFAULT_VERIFICATION_QUERY,
  type TestMySQLInput,
} from '../services/mysqlService.js';
import {
  deleteBrandingObjectByPublicUrl,
  uploadBrandingAsset,
  type BrandingUploadKind,
} from '../services/brandingService.js';
import {
  deleteCustomFont,
  resolveFontFamilyValueForObjectKey,
  uploadCustomFont,
} from '../services/fontService.js';
import { RoleDefinition } from '../models/RoleDefinition.js';
import { isBuiltInRoleKey, isValidCustomRoleKey } from '../services/roleService.js';
import { emitToAll, emitToUsers } from '../utils/socketIO.js';
import { Workspace } from '../models/Workspace.js';
import { Board } from '../models/Board.js';
import { Card } from '../models/Card.js';
import { Activity } from '../models/Activity.js';
import { Session } from '../models/Session.js';
import { Notification } from '../models/Notification.js';
import { InviteLink } from '../models/InviteLink.js';
import { ImportJob } from '../models/ImportJob.js';
import { BackupJob } from '../models/BackupJob.js';
import { BoardLabel } from '../models/BoardLabel.js';
import { createActivity } from '../services/activityService.js';
import { deleteUserAvatar } from '../services/userAvatarService.js';
import { adminBackupRoutes } from './adminBackupRoutes.js';
import { getAdminSystemMetricsSnapshot } from '../services/systemMetricsService.js';

const router = Router();

function emitPermissionsUpdated(input: {
  affectedUserIds: readonly string[];
  reason: string;
  roleKey?: string;
}): void {
  const payload: Record<string, unknown> = {
    affectedUserIds: [...input.affectedUserIds],
    reason: input.reason,
    serverTs: Date.now(),
  };
  if (input.roleKey != null && input.roleKey.trim() !== '') {
    payload.roleKey = input.roleKey;
  }
  if (input.affectedUserIds.length > 0) {
    emitToUsers(input.affectedUserIds, 'permissions.updated', payload);
    return;
  }
  emitToAll('permissions.updated', payload);
}

const brandingUpload = multer({
  storage: multer.memoryStorage(),
  /** Large enough for home background images (see brandingService MAX_HOME_BG_IMAGE_BYTES). */
  limits: { fileSize: 10 * 1024 * 1024 },
});

const fontUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const fontDisplayNameSchema = z
  .string()
  .trim()
  .min(1, 'Display name is required')
  .max(80)
  .regex(/^[^"\\\r\n<>&]+$/, 'Display name contains invalid characters');

// Admin routes - require authentication and app admin status
router.use(requireAuth as RequestHandler);
router.use(requireAppAdmin as RequestHandler);
router.use(apiRateLimiter);

router.use('/backup', adminBackupRoutes);

router.get('/system/metrics', async (_req, res, next) => {
  try {
    const metrics = await getAdminSystemMetricsSnapshot();
    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

// Account unlock endpoint (admin only)
router.post('/users/:id/unlock', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    const targetUser = await User.findById(id);
    if (!targetUser) {
      res.status(404).json({
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    // Unlock account
    targetUser.failedLoginAttempts = 0;
    delete targetUser.lockedUntil;
    await targetUser.save();

    logAuditEvent({
      userId: authReq.user.id,
      action: 'unlock_account',
      resourceType: 'user',
      resourceId: id,
      ipAddress: req.ip || undefined,
      timestamp: new Date(),
    });

    logger.info(
      { adminId: authReq.user.id, targetUserId: id },
      'Account unlocked by admin'
    );

    res.json({ message: 'Account unlocked successfully' });
  } catch (error) {
    next(error);
  }
});

// Get admin configuration
router.get('/config', async (_req, res, next) => {
  try {
    const config = await getAdminConfig();
    res.json({ config: sanitizeAdminConfigForClient(config) });
  } catch (error) {
    next(error);
  }
});

const testExternalMysqlSavedSchema = z.object({
  useSavedCredentials: z.literal(true),
});

const testExternalMysqlInlineSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).optional(),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().optional(),
  verificationQuery: z.string().optional(),
});

// Test external MySQL (Bun SQL) using submitted credentials or server-stored secrets only
router.post('/config/test-external-mysql', async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const savedParsed = testExternalMysqlSavedSchema.safeParse(body);
    let mysqlTestInput: TestMySQLInput;

    if (savedParsed.success) {
      const cfg = await getAdminConfig();
      if (!isExternalMysqlCredentialsStored(cfg.externalMySQL)) {
        res.status(400).json({
          error: {
            message: 'External database is not fully configured',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
      const ext = cfg.externalMySQL;
      let password = await decryptOptionalCredential(ext.password ?? '');
      if (password === '') {
        res.status(400).json({
          error: {
            message: 'Database password is required to test the connection',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
      const hostParsed = splitMysqlHostInput(ext.host ?? '', ext.port ?? 3306);
      let verificationQuery = (ext.verificationQuery || DEFAULT_VERIFICATION_QUERY).trim();
      verificationQuery = await decryptOptionalCredential(verificationQuery);
      mysqlTestInput = {
        host: hostParsed.host,
        port: hostParsed.port,
        database: ext.database ?? '',
        username: await decryptOptionalCredential(ext.username ?? ''),
        password,
        verificationQuery,
      };
    } else {
      const parsed = testExternalMysqlInlineSchema.parse(body);
      let password = parsed.password ?? '';

      if (password === '') {
        const saved = await getAdminConfig();
        const stored = saved.externalMySQL.password;
        if (stored) {
          password = await decryptOptionalCredential(stored);
        }
      }

      if (password === '') {
        res.status(400).json({
          error: {
            message: 'Database password is required to test the connection',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }

      const hostParsed = splitMysqlHostInput(parsed.host, parsed.port ?? 3306);
      mysqlTestInput = {
        host: hostParsed.host,
        port: hostParsed.port,
        database: parsed.database,
        username: parsed.username,
        password,
      };
      if (parsed.verificationQuery !== undefined) {
        mysqlTestInput.verificationQuery = parsed.verificationQuery;
      }
    }

    const result = await testExternalMySQLConnection(mysqlTestInput);

    res.json(result);
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

// Update admin configuration
router.put('/config', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const config = await updateAdminConfig(
      req.body as Record<string, unknown>,
      authReq.user.id
    );
    res.json({ config: sanitizeAdminConfigForClient(config) });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: {
          message: error.message,
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }
    next(error);
  }
});

router.post(
  '/branding/upload',
  fileUploadRateLimiter,
  brandingUpload.single('file'),
  async (req, res, next) => {
    try {
      const typeRaw = req.query.type;
      const type = typeof typeRaw === 'string' ? typeRaw : '';
      const typeToKind: Record<string, BrandingUploadKind> = {
        logo: 'login-logo',
        favicon: 'favicon',
        'home-nav-icon': 'home-nav-icon',
        'home-bg-image': 'home-bg-image',
        'board-nav-icon': 'board-nav-icon',
      };
      const kind = typeToKind[type];
      if (!kind) {
        res.status(400).json({
          error: {
            message:
              'Query parameter type must be "logo", "favicon", "home-nav-icon", "home-bg-image", or "board-nav-icon"',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
      if (!req.file) {
        res.status(400).json({
          error: {
            message: 'File is required',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
      const url = await uploadBrandingAsset(
        req.file.buffer,
        req.file.mimetype,
        kind,
        req.file.originalname
      );
      res.json({ url });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({
          error: {
            message: error.message,
            code: 'BRANDING_UPLOAD_FAILED',
            statusCode: 400,
          },
        });
        return;
      }
      next(error);
    }
  }
);

const deleteBrandingFileBodySchema = z.object({
  url: z.string().min(1),
});

router.delete('/branding/file', async (req, res, next) => {
  try {
    const { url } = deleteBrandingFileBodySchema.parse(req.body);
    await deleteBrandingObjectByPublicUrl(url);
    res.status(204).end();
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
    if (error instanceof Error && error.message === 'Invalid branding asset URL') {
      res.status(400).json({
        error: {
          message: error.message,
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    next(error);
  }
});

router.post(
  '/fonts/upload',
  fileUploadRateLimiter,
  fontUpload.single('file'),
  async (req, res, next) => {
    try {
      const displayNameRaw =
        typeof req.body.displayName === 'string' ? req.body.displayName : undefined;
      const displayName = displayNameRaw != null && displayNameRaw.trim() !== ''
        ? fontDisplayNameSchema.parse(displayNameRaw)
        : undefined;
      if (!req.file) {
        res.status(400).json({
          error: {
            message: 'File is required',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
      const font = await uploadCustomFont(
        req.file.buffer,
        req.file.mimetype,
        displayName,
        req.file.originalname
      );
      res.status(201).json({ font });
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
      if (error instanceof Error) {
        res.status(400).json({
          error: {
            message: error.message,
            code: 'FONT_UPLOAD_FAILED',
            statusCode: 400,
          },
        });
        return;
      }
      next(error);
    }
  }
);

router.delete('/fonts/:fileName', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const raw = req.params.fileName;
    const fileName = typeof raw === 'string' ? raw.replace(/\\/g, '/').split('/').pop() ?? '' : '';
    const familyBefore = await resolveFontFamilyValueForObjectKey(fileName);
    await deleteCustomFont(fileName);
    if (familyBefore) {
      const cfg = await getAdminConfig();
      const stored = cfg.appScreenBranding?.defaultUiFontFamily?.trim();
      if (stored === familyBefore) {
        await updateAdminConfig(
          { appScreenBranding: { defaultUiFontFamily: null } },
          authReq.user.id
        );
      }
    }
    res.status(204).end();
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid font file name') {
      res.status(400).json({
        error: {
          message: error.message,
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }
    next(error);
  }
});

// Convert placeholder user to regular user
router.post('/users/:id/convert-from-placeholder', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    const placeholderUser = await User.findById(id);
    if (!placeholderUser) {
      res.status(404).json({
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    if (!placeholderUser.isPlaceholder) {
      res.status(400).json({
        error: {
          message: 'User is not a placeholder user',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }

    // Convert placeholder to regular user
    placeholderUser.isPlaceholder = false;
    placeholderUser.set('placeholderSource', undefined, { strict: false });
    placeholderUser.set('placeholderEmail', undefined, { strict: false });
    placeholderUser.set('placeholderName', undefined, { strict: false });
    await placeholderUser.save();

    logAuditEvent({
      userId: authReq.user.id,
      action: 'convert_placeholder_user',
      resourceType: 'user',
      resourceId: id,
      ipAddress: req.ip || undefined,
      timestamp: new Date(),
    });

    logger.info(
      { adminId: authReq.user.id, placeholderUserId: id },
      'Placeholder user converted by admin'
    );

    res.json({ message: 'Placeholder user converted successfully', user: placeholderUser });
  } catch (error) {
    next(error);
  }
});

// Merge placeholder user with existing user
router.post('/users/:placeholderId/merge/:userId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { placeholderId, userId } = req.params;

    const placeholderUser = await User.findById(placeholderId);
    const targetUser = await User.findById(userId);

    if (!placeholderUser) {
      res.status(404).json({
        error: {
          message: 'Placeholder user not found',
          code: 'USER_NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    if (!targetUser) {
      res.status(404).json({
        error: {
          message: 'Target user not found',
          code: 'USER_NOT_FOUND',
          statusCode: 404,
        },
      });
      return;
    }

    if (!placeholderUser.isPlaceholder) {
      res.status(400).json({
        error: {
          message: 'Source user is not a placeholder user',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }

    // TODO: Transfer all workspace/board memberships, activities, etc. from placeholder to target user
    // For now, just delete the placeholder user
    // In a full implementation, you would:
    // 1. Update all workspace memberships
    // 2. Update all board memberships
    // 3. Update all card assignees
    // 4. Update all comments
    // 5. Update all activities
    // 6. Delete placeholder user

    await User.findByIdAndDelete(placeholderId);

    logAuditEvent({
      userId: authReq.user.id,
      action: 'merge_placeholder_user',
      resourceType: 'user',
      resourceId: userId,
      metadata: { placeholderUserId: placeholderId },
      ipAddress: req.ip || undefined,
      timestamp: new Date(),
    });

    logger.info(
      { adminId: authReq.user.id, placeholderUserId: placeholderId, targetUserId: userId },
      'Placeholder user merged with existing user by admin'
    );

    res.json({ message: 'Placeholder user merged successfully', user: targetUser });
  } catch (error) {
    next(error);
  }
});

// Get placeholder users
router.get('/users/placeholders', async (_req, res, next) => {
  try {
    const placeholderUsers = await User.find({ isPlaceholder: true })
      .select('email displayName placeholderName placeholderEmail placeholderSource isPlaceholder')
      .sort({ createdAt: -1 });
    res.json({ users: placeholderUsers });
  } catch (error) {
    next(error);
  }
});

// Permission Set endpoints
router.get('/permission-sets', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const permissionSets = await PermissionSet.find({ createdBy: authReq.user.id })
      .sort({ createdAt: -1 });
    res.json({ permissionSets });
  } catch (error) {
    next(error);
  }
});

router.post('/permission-sets', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { name, description, permissions } = req.body;

    if (!name || !Array.isArray(permissions)) {
      res.status(400).json({
        error: {
          message: 'Name and permissions array are required',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
      return;
    }

    const permissionSet = new PermissionSet({
      name,
      description,
      permissions,
      createdBy: authReq.user.id,
    });

    await permissionSet.save();

    logAuditEvent({
      userId: authReq.user.id,
      action: 'permission_set.create',
      resourceType: 'permission_set',
      resourceId: permissionSet._id.toString(),
      timestamp: new Date(),
    });

    res.status(201).json({ permissionSet });
  } catch (error) {
    next(error);
  }
});

const roleKeySchema = z.string().trim().min(1).max(80);
const roleHierarchyLevelSchema = z.number().int().min(0).max(1_000_000);
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
  readonly failedLoginAttempts: number;
  readonly authProvider: AdminUserAuthProvider;
}

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

function appMasterRemovalMessage(targetDisplayName: string): string {
  return `App Master removed ${targetDisplayName}`;
}

async function removeTargetUserFromWorkspaceMemberships(input: {
  readonly targetUserId: string;
  readonly actingAdminId: string;
  readonly targetDisplayName: string;
  readonly ipAddress: string | undefined;
}): Promise<number> {
  const workspaces = await Workspace.find({ 'members.userId': input.targetUserId })
    .select('_id')
    .lean();
  if (workspaces.length === 0) {
    return 0;
  }

  const message = appMasterRemovalMessage(input.targetDisplayName);
  for (const workspace of workspaces) {
    const workspaceId = String(workspace._id);
    await Workspace.updateOne({ _id: workspace._id }, { $pull: { members: { userId: input.targetUserId } } });
    logAuditEvent({
      userId: input.actingAdminId,
      action: 'workspace.member.remove.app_master',
      resourceType: 'workspace',
      resourceId: workspaceId,
      metadata: {
        removedUserId: input.targetUserId,
        removedDisplayName: input.targetDisplayName,
        message,
      },
      ipAddress: input.ipAddress,
      timestamp: new Date(),
    });
  }
  return workspaces.length;
}

async function removeTargetUserFromBoardMemberships(input: {
  readonly targetUserId: string;
  readonly actingAdminId: string;
  readonly targetDisplayName: string;
  readonly ipAddress: string | undefined;
}): Promise<number> {
  const boards = await Board.find({ 'members.userId': input.targetUserId })
    .select('_id')
    .lean();
  if (boards.length === 0) {
    return 0;
  }

  const message = appMasterRemovalMessage(input.targetDisplayName);
  for (const board of boards) {
    const boardId = String(board._id);
    await Board.updateOne({ _id: board._id }, { $pull: { members: { userId: input.targetUserId } } });
    logAuditEvent({
      userId: input.actingAdminId,
      action: 'board.member.remove.app_master',
      resourceType: 'board',
      resourceId: boardId,
      metadata: {
        removedUserId: input.targetUserId,
        removedDisplayName: input.targetDisplayName,
        message,
      },
      ipAddress: input.ipAddress,
      timestamp: new Date(),
    });
    createActivity({
      boardId,
      userId: input.actingAdminId,
      type: 'board.member.remove.app_master',
      description: message,
      metadata: {
        targetUserId: input.targetUserId,
        targetDisplayName: input.targetDisplayName,
      },
    });
  }
  return boards.length;
}

router.get('/roles', async (_req, res, next) => {
  try {
    const roles = await RoleDefinition.find().sort({ isBuiltIn: -1, key: 1 }).lean();
    res.json({ roles });
  } catch (error) {
    next(error);
  }
});

const createRoleSchema = z.object({
  key: roleKeySchema,
  displayName: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
  permissions: z.array(z.string().trim().min(1).max(200)).default([]),
  hierarchyLevel: roleHierarchyLevelSchema,
});

router.post('/roles', async (req, res, next) => {
  try {
    const body = createRoleSchema.parse(req.body);
    if (isBuiltInRoleKey(body.key)) {
      res.status(400).json({
        error: { message: 'Role key collides with built-in role', code: 'VALIDATION_ERROR', statusCode: 400 },
      });
      return;
    }
    if (!isValidCustomRoleKey(body.key)) {
      res.status(400).json({
        error: { message: 'Invalid custom role key (expected custom:<slug>)', code: 'VALIDATION_ERROR', statusCode: 400 },
      });
      return;
    }
    const existing = await RoleDefinition.findOne({ key: body.key }).select('_id').lean();
    if (existing) {
      res.status(409).json({
        error: { message: 'Role key already exists', code: 'CONFLICT', statusCode: 409 },
      });
      return;
    }
    const hierarchyExists = await RoleDefinition.findOne({ hierarchyLevel: body.hierarchyLevel })
      .select('_id key')
      .lean();
    if (hierarchyExists) {
      res.status(409).json({
        error: {
          message: `Hierarchy number ${body.hierarchyLevel} is already assigned to role "${String(hierarchyExists.key)}".`,
          code: 'CONFLICT',
          statusCode: 409,
        },
      });
      return;
    }
    const created = await RoleDefinition.create({
      key: body.key,
      displayName: body.displayName,
      ...(body.description !== undefined ? { description: body.description } : {}),
      permissions: body.permissions,
      hierarchyLevel: body.hierarchyLevel,
      isBuiltIn: false,
    });
    res.status(201).json({ role: created });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: { message: 'Validation failed', code: 'VALIDATION_ERROR', statusCode: 400, errors: error.issues },
      });
      return;
    }
    next(error);
  }
});

const updateRoleSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).optional(),
  permissions: z.array(z.string().trim().min(1).max(200)).optional(),
  hierarchyLevel: roleHierarchyLevelSchema.optional(),
});

router.put('/roles/:roleKey', async (req, res, next) => {
  try {
    const roleKey = roleKeySchema.parse(req.params.roleKey);
    const patch = updateRoleSchema.parse(req.body);
    const role = await RoleDefinition.findOne({ key: roleKey });
    if (!role) {
      res.status(404).json({ error: { message: 'Role not found', code: 'NOT_FOUND', statusCode: 404 } });
      return;
    }
    if (patch.displayName !== undefined) role.displayName = patch.displayName;
    if (patch.description !== undefined) role.description = patch.description;
    if (patch.permissions !== undefined) role.permissions = patch.permissions;
    if (patch.hierarchyLevel !== undefined) {
      const hierarchyExists = await RoleDefinition.findOne({
        hierarchyLevel: patch.hierarchyLevel,
        key: { $ne: roleKey },
      })
        .select('_id key')
        .lean();
      if (hierarchyExists) {
        res.status(409).json({
          error: {
            message: `Hierarchy number ${patch.hierarchyLevel} is already assigned to role "${String(hierarchyExists.key)}".`,
            code: 'CONFLICT',
            statusCode: 409,
          },
        });
        return;
      }
      role.hierarchyLevel = patch.hierarchyLevel;
    }
    await role.save();
    emitPermissionsUpdated({
      affectedUserIds: [],
      reason: 'role.definition.update',
      roleKey,
    });
    res.json({ role });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: { message: 'Validation failed', code: 'VALIDATION_ERROR', statusCode: 400, errors: error.issues },
      });
      return;
    }
    next(error);
  }
});

router.delete('/roles/:roleKey', async (req, res, next) => {
  try {
    const roleKey = roleKeySchema.parse(req.params.roleKey);
    const role = await RoleDefinition.findOne({ key: roleKey });
    if (!role) {
      res.status(404).json({ error: { message: 'Role not found', code: 'NOT_FOUND', statusCode: 404 } });
      return;
    }
    if (role.isBuiltIn) {
      res.status(400).json({
        error: { message: 'Built-in roles cannot be deleted', code: 'VALIDATION_ERROR', statusCode: 400 },
      });
      return;
    }
    await RoleDefinition.deleteOne({ _id: role._id });
    emitPermissionsUpdated({
      affectedUserIds: [],
      reason: 'role.definition.delete',
      roleKey,
    });
    res.status(204).end();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: { message: 'Validation failed', code: 'VALIDATION_ERROR', statusCode: 400, errors: error.issues },
      });
      return;
    }
    next(error);
  }
});

/**
 * Account that may not revoke their own App Admin (bootstrap / legacy first admin).
 * Prefer active `foundingAppAdmin`; if none, use earliest-created admin when no founding flags exist.
 */
async function resolveBootstrapAppAdminId(): Promise<string | null> {
  const foundingActive = await User.findOne({ foundingAppAdmin: true, isAppAdmin: true })
    .select('_id')
    .lean();
  if (foundingActive) {
    return String(foundingActive._id);
  }
  const hasFoundingRecord = await User.exists({ foundingAppAdmin: true });
  if (hasFoundingRecord) {
    return null;
  }
  const legacy = await User.findOne({ isAppAdmin: true }).sort({ createdAt: 1 }).select('_id').lean();
  return legacy ? String(legacy._id) : null;
}

router.get('/app-admins', async (_req, res, next) => {
  try {
    const admins = await User.find({ isAppAdmin: true })
      .select('_id displayName email')
      .sort({ createdAt: 1 })
      .lean();
    const bootstrapAppAdminId = await resolveBootstrapAppAdminId();
    res.json({ appAdmins: admins, bootstrapAppAdminId });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(ADMIN_USERS_MAX_LIMIT, Math.max(1, limitRaw))
      : 80;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : '';
    const offset = decodeSkipCursor(cursor);

    const filter: Record<string, unknown> = {};
    if (q !== '') {
      const re = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ displayName: re }, { email: re }, { username: re }];
    }

    const rows = await User.find(filter)
      .select(
        '_id displayName email username isAppAdmin createdAt lastLogin emailVerified failedLoginAttempts googleId +passwordHash',
      )
      .sort({ displayName: 1, email: 1, _id: 1 })
      .skip(offset)
      .limit(limit)
      .lean();

    const users: AdminUserListRow[] = rows.map((u) => ({
      _id: String(u._id),
      displayName: u.displayName,
      email: u.email,
      username: u.username,
      isAppAdmin: u.isAppAdmin === true,
      createdAt: u.createdAt.toISOString(),
      ...(u.lastLogin instanceof Date ? { lastLogin: u.lastLogin.toISOString() } : {}),
      emailVerified: u.emailVerified === true,
      failedLoginAttempts: typeof u.failedLoginAttempts === 'number' ? u.failedLoginAttempts : 0,
      authProvider: resolveAuthProvider({ googleId: u.googleId, passwordHash: u.passwordHash }),
    }));
    const nextCursor = users.length === limit ? encodeSkipCursor(offset + limit) : undefined;
    res.json({ users, ...(nextCursor !== undefined ? { nextCursor } : {}) });
  } catch (error) {
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
        {
          $pull: {
            assignees: id,
            comments: { userId: id },
            attachments: { uploadedBy: id },
          },
        },
      ),
      Card.updateMany({ createdBy: id }, { $set: { createdBy: authReq.user.id } }),
      User.deleteOne({ _id: id }),
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

const setAppAdminSchema = z.object({
  userId: z.string().trim().min(1),
});

router.post('/app-admins', async (req, res, next) => {
  try {
    const { userId } = setAppAdminSchema.parse(req.body);
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND', statusCode: 404 } });
      return;
    }
    if (!user.isAppAdmin) {
      user.isAppAdmin = true;
      await user.save();
      emitPermissionsUpdated({
        affectedUserIds: [userId],
        reason: 'app_admin.granted',
      });
    }
    res.status(200).json({ appAdmin: { _id: user._id, displayName: user.displayName, email: user.email } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: { message: 'Validation failed', code: 'VALIDATION_ERROR', statusCode: 400, errors: error.issues },
      });
      return;
    }
    next(error);
  }
});

router.delete('/app-admins/:userId', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = roleKeySchema.parse(req.params.userId);
    const count = await User.countDocuments({ isAppAdmin: true });
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND', statusCode: 404 } });
      return;
    }
    if (userId === authReq.user.id && user.isAppAdmin) {
      const bootstrapId = await resolveBootstrapAppAdminId();
      if (bootstrapId !== null && userId === bootstrapId) {
        res.status(403).json({
          error: {
            message:
              'The bootstrap App Admin cannot remove their own access. Add another App Admin first, then they can remove you if needed.',
            code: 'FORBIDDEN',
            statusCode: 403,
          },
        });
        return;
      }
    }
    if (user.isAppAdmin && count <= 1) {
      res.status(400).json({
        error: { message: 'At least one App Admin must remain', code: 'VALIDATION_ERROR', statusCode: 400 },
      });
      return;
    }
    if (user.isAppAdmin) {
      user.isAppAdmin = false;
      await user.save();
      emitPermissionsUpdated({
        affectedUserIds: [userId],
        reason: 'app_admin.revoked',
      });
    }
    res.status(204).end();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: { message: 'Validation failed', code: 'VALIDATION_ERROR', statusCode: 400, errors: error.issues },
      });
      return;
    }
    next(error);
  }
});

export { router as adminRoutes };

