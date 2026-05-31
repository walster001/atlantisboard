import type { Router } from 'express';
import { z } from 'zod';
import { RoleDefinition } from '../../models/RoleDefinition.js';
import {
  findForbiddenWorkspaceRolePermission,
  isBuiltInRoleKey,
  isValidCustomRoleKey,
} from '../../services/roleService.js';
import { emitPermissionsUpdated } from './helpers.js';
import { handleApiRouteError } from '../../utils/mapServiceErrorToHttp.js';
import { parseOrThrow } from '../../utils/zodValidation.js';

const roleKeySchema = z.string().trim().min(1).max(80);
const roleHierarchyLevelSchema = z.number().int().min(0).max(1_000_000);

const createRoleSchema = z.object({
  key: roleKeySchema,
  displayName: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
  permissions: z.array(z.string().trim().min(1).max(200)).default([]),
  hierarchyLevel: roleHierarchyLevelSchema,
});

const updateRoleSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).optional(),
  permissions: z.array(z.string().trim().min(1).max(200)).optional(),
  hierarchyLevel: roleHierarchyLevelSchema.optional(),
});

export function registerRolesRoutes(router: Router): void {
  router.get('/roles', async (_req, res, next) => {
    try {
      const roles = await RoleDefinition.find().sort({ isBuiltIn: -1, key: 1 }).lean();
      res.json({ roles });
    } catch (error) {
      next(error);
    }
  });

  router.post('/roles', async (req, res, next) => {
    try {
      const body = parseOrThrow(createRoleSchema, req.body);
      if (isBuiltInRoleKey(body.key)) {
        res.status(400).json({
          error: {
            message: 'Role key collides with built-in role',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
      if (!isValidCustomRoleKey(body.key)) {
        res.status(400).json({
          error: {
            message: 'Invalid custom role key (expected custom:<slug>)',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
        return;
      }
      const forbiddenPermission = findForbiddenWorkspaceRolePermission(body.permissions);
      if (forbiddenPermission != null) {
        res.status(400).json({
          error: {
            message: `Permission "${forbiddenPermission}" is not allowed on workspace/board roles`,
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
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
      handleApiRouteError(res, error, next);
    }
  });

  router.put('/roles/:roleKey', async (req, res, next) => {
    try {
      const roleKey = parseOrThrow(roleKeySchema, req.params.roleKey);
      const patch = parseOrThrow(updateRoleSchema, req.body);
      const role = await RoleDefinition.findOne({ key: roleKey });
      if (!role) {
        res
          .status(404)
          .json({ error: { message: 'Role not found', code: 'NOT_FOUND', statusCode: 404 } });
        return;
      }
      if (patch.displayName !== undefined) role.displayName = patch.displayName;
      if (patch.description !== undefined) role.description = patch.description;
      if (patch.permissions !== undefined) {
        const forbiddenPermission = findForbiddenWorkspaceRolePermission(patch.permissions);
        if (forbiddenPermission != null) {
          res.status(400).json({
            error: {
              message: `Permission "${forbiddenPermission}" is not allowed on workspace/board roles`,
              code: 'VALIDATION_ERROR',
              statusCode: 400,
            },
          });
          return;
        }
        role.permissions = patch.permissions;
      }
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
      handleApiRouteError(res, error, next);
    }
  });

  router.delete('/roles/:roleKey', async (req, res, next) => {
    try {
      const roleKey = parseOrThrow(roleKeySchema, req.params.roleKey);
      const role = await RoleDefinition.findOne({ key: roleKey });
      if (!role) {
        res
          .status(404)
          .json({ error: { message: 'Role not found', code: 'NOT_FOUND', statusCode: 404 } });
        return;
      }
      if (role.isBuiltIn) {
        res.status(400).json({
          error: {
            message: 'Built-in roles cannot be deleted',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
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
      handleApiRouteError(res, error, next);
    }
  });
}
