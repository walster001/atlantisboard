/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { importPreflightPayloadSchema } from '../src/shared/import/importPreflightSchema.js';

describe('importPreflightPayloadSchema', () => {
  it('accepts sourceRoleMappings for placeholder imports', () => {
    const parsed = importPreflightPayloadSchema.parse({
      userDecisions: [],
      unmappedUserPolicy: 'create_placeholders',
      sourceRoleMappings: [
        { sourceRoleKey: 'admin', targetRoleKey: 'manager' },
        { sourceRoleKey: 'normal', targetRoleKey: 'viewer' },
      ],
    });
    expect(parsed.sourceRoleMappings).toHaveLength(2);
  });

  it('accepts custom role keys in sourceRoleMappings (server validates against RoleDefinition)', () => {
    const parsed = importPreflightPayloadSchema.parse({
      userDecisions: [],
      unmappedUserPolicy: 'create_placeholders',
      sourceRoleMappings: [{ sourceRoleKey: 'admin', targetRoleKey: 'custom:designer' }],
    });
    expect(parsed.sourceRoleMappings?.[0]?.targetRoleKey).toBe('custom:designer');
  });
});
