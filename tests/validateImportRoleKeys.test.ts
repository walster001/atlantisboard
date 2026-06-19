/// <reference types="bun-types" />
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { RoleDefinition } from '../src/server/models/RoleDefinition.js';
import {
  validateImportPreflightRoleKeys,
  validateImportRoleKeys,
} from '../src/server/services/import/validateImportRoleKeys.js';
import { validateRoleKeyExists } from '../src/server/services/roleService.js';
import { ValidationError } from '../src/shared/errors/domainErrors.js';
import { describeWhenDeps } from './helpers/integrationEnv.js';
import { connectTestDatabase } from './helpers/testHelpers.js';

describe('validateRoleKeyExists (unit)', () => {
  it('rejects malformed role keys without a database lookup', async () => {
    await expect(validateRoleKeyExists('not-a-role')).rejects.toThrow(ValidationError);
    await expect(validateRoleKeyExists('')).rejects.toThrow(ValidationError);
  });
});

describeWhenDeps({ mongo: true, mongoTestUriOnly: true }, 'validateImportRoleKeys', () => {
  beforeAll(async () => {
    await connectTestDatabase();
    await RoleDefinition.deleteMany({ key: 'custom:test-import-role' });
    await RoleDefinition.create({
      key: 'custom:test-import-role',
      displayName: 'Test import role',
      permissions: ['boards.view'],
      hierarchyLevel: 20,
      isBuiltIn: false,
    });
  });

  afterAll(async () => {
    await RoleDefinition.deleteMany({ key: 'custom:test-import-role' });
  });

  it('accepts built-in and persisted custom role keys', async () => {
    await expect(validateImportRoleKeys(['manager', 'custom:test-import-role'])).resolves.toBeUndefined();
  });

  it('rejects unknown custom role keys', async () => {
    await expect(validateImportRoleKeys(['custom:missing-role'])).rejects.toThrow('Unknown roleKey');
  });

  it('validates preflight sourceRoleMappings targetRoleKey values', async () => {
    await expect(
      validateImportPreflightRoleKeys({
        userDecisions: [],
        unmappedUserPolicy: 'create_placeholders',
        sourceRoleMappings: [{ sourceRoleKey: 'admin', targetRoleKey: 'custom:test-import-role' }],
      }),
    ).resolves.toBeUndefined();

    await expect(
      validateImportPreflightRoleKeys({
        userDecisions: [],
        unmappedUserPolicy: 'create_placeholders',
        sourceRoleMappings: [{ sourceRoleKey: 'admin', targetRoleKey: 'custom:does-not-exist' }],
      }),
    ).rejects.toThrow('Unknown roleKey');
  });
});
