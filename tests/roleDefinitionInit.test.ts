/// <reference types="bun-types" />
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { RoleDefinition } from '../src/server/models/RoleDefinition.js';
import { runRolePermissionMigrations } from '../src/server/services/rolePermissionMigrations.js';
import {
  seedBuiltinRoleDefinitions,
  syncBuiltinRolePermissionsFromCatalog,
} from '../src/server/services/roleSeeds.js';
import {
  BUILTIN_ROLE_SEEDS,
  permissionsForBuiltinRole,
  type BuiltInRoleKey,
} from '../src/shared/permissions/catalog.js';
import { describeMongoTest } from './helpers/integrationEnv.js';
import { INTEGRATION_HOOK_TIMEOUT_MS } from './helpers/integrationHooks.js';
import { connectTestDatabase, disconnectTestDatabase } from './helpers/testHelpers.js';

const REPO_ROOT = process.cwd();

function sortedPermissions(permissions: readonly string[]): readonly string[] {
  return [...permissions].sort();
}

function catalogPermissions(roleKey: BuiltInRoleKey): readonly string[] {
  return sortedPermissions(permissionsForBuiltinRole(roleKey));
}

async function assertBuiltinRolesMatchCatalog(): Promise<void> {
  for (const seed of BUILTIN_ROLE_SEEDS) {
    const doc = await RoleDefinition.findOne({ key: seed.key, isBuiltIn: true }).lean();
    expect(doc).not.toBeNull();
    expect(doc?.displayName).toBe(seed.displayName);
    expect(doc?.hierarchyLevel).toBe(seed.hierarchyLevel);
    expect(sortedPermissions(doc?.permissions ?? [])).toEqual(sortedPermissions(seed.permissions));
  }
}

async function runRoleDefinitionInitSequence(): Promise<void> {
  await seedBuiltinRoleDefinitions();
  await runRolePermissionMigrations();
  await syncBuiltinRolePermissionsFromCatalog();
}

async function seedLegacyStaleBuiltinRoles(): Promise<void> {
  await RoleDefinition.deleteMany({ isBuiltIn: true });
  await RoleDefinition.create([
    {
      key: 'admin',
      displayName: 'Admin',
      permissions: [
        'boards.view',
        'export.board.json',
        'boards.members.role.update.same',
        'ui.boards.settings.open',
        'import.trello.start',
      ],
      hierarchyLevel: 300,
      isBuiltIn: true,
    },
    {
      key: 'manager',
      displayName: 'Manager',
      permissions: [
        'boards.view',
        'boards.members.role.update',
        'boards.members.role.update.any',
        'cards.duplicate',
        'invites.view',
        'workspaces.create',
      ],
      hierarchyLevel: 200,
      isBuiltIn: true,
    },
    {
      key: 'viewer',
      displayName: 'Viewer',
      permissions: ['boards.view', 'boards.view_kanban_snapshot'],
      hierarchyLevel: 100,
      isBuiltIn: true,
    },
    {
      key: 'member',
      displayName: 'Member',
      permissions: ['boards.view'],
      hierarchyLevel: 150,
      isBuiltIn: true,
    },
  ]);
}

describe('role definition init wiring', () => {
  it('runs catalog sync after migrations in roleService', () => {
    const roleServiceSource = readFileSync(join(REPO_ROOT, 'src/server/services/roleService.ts'), 'utf8');
    expect(roleServiceSource).toContain('await runRolePermissionMigrations()');
    expect(roleServiceSource).toContain('await syncBuiltinRolePermissionsFromCatalog()');
    const migrationsIndex = roleServiceSource.indexOf('await runRolePermissionMigrations()');
    const syncIndex = roleServiceSource.indexOf('await syncBuiltinRolePermissionsFromCatalog()');
    expect(migrationsIndex).toBeGreaterThan(-1);
    expect(syncIndex).toBeGreaterThan(migrationsIndex);
  });

  it('includes catalog sync in production server bundle when dist is built', () => {
    const bundlePath = join(REPO_ROOT, 'dist/server/index.js');
    if (!existsSync(bundlePath)) {
      return;
    }
    const bundle = readFileSync(bundlePath, 'utf8');
    expect(bundle).toContain('syncBuiltinRolePermissionsFromCatalog');
    const seedBlockMatch = bundle.match(
      /async function seedRoleDefinitions\(\)\s*\{[\s\S]*?\n\}/,
    );
    expect(seedBlockMatch?.[0]).toBeString();
    const seedBlock = seedBlockMatch?.[0] ?? '';
    const migrationsIndex = seedBlock.indexOf('runRolePermissionMigrations');
    const syncIndex = seedBlock.indexOf('syncBuiltinRolePermissionsFromCatalog');
    expect(migrationsIndex).toBeGreaterThan(-1);
    expect(syncIndex).toBeGreaterThan(migrationsIndex);
  });
});

describeMongoTest('role definition initialization', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  }, INTEGRATION_HOOK_TIMEOUT_MS);

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await RoleDefinition.deleteMany({});
    }
    await disconnectTestDatabase();
  });

  it('seeds fresh database roles to match catalog', async () => {
    await RoleDefinition.deleteMany({});
    await runRoleDefinitionInitSequence();
    await assertBuiltinRolesMatchCatalog();
    expect(await RoleDefinition.countDocuments({ isBuiltIn: true })).toBe(3);
  });

  it('migrates legacy stale built-in roles to catalog', async () => {
    await seedLegacyStaleBuiltinRoles();
    await runRoleDefinitionInitSequence();

    await assertBuiltinRolesMatchCatalog();
    expect(await RoleDefinition.findOne({ key: 'member', isBuiltIn: true })).toBeNull();

    const admin = await RoleDefinition.findOne({ key: 'admin', isBuiltIn: true }).lean();
    expect(admin?.permissions).toContain('boards.members.role.update');
    expect(admin?.permissions).toContain('boards.members.role.update.any');
    expect(admin?.permissions).not.toContain('export.board.json');

    const manager = await RoleDefinition.findOne({ key: 'manager', isBuiltIn: true }).lean();
    expect(manager?.permissions).toContain('boards.members.role.update.lower');
    expect(manager?.permissions).not.toContain('boards.members.role.update');
    expect(manager?.permissions).not.toContain('cards.duplicate');
  });

  it('leaves $setOnInsert-only seeding reconcilable via catalog sync', async () => {
    await RoleDefinition.deleteMany({});
    await seedBuiltinRoleDefinitions();
    await RoleDefinition.updateOne(
      { key: 'admin', isBuiltIn: true },
      { $set: { permissions: ['boards.view'] } },
    );

    await syncBuiltinRolePermissionsFromCatalog();

    const admin = await RoleDefinition.findOne({ key: 'admin', isBuiltIn: true }).lean();
    expect(sortedPermissions(admin?.permissions ?? [])).toEqual(catalogPermissions('admin'));
  });
});
