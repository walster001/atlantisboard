import { describe, expect, it } from 'bun:test';
import { findForbiddenWorkspaceRolePermission } from '../src/server/services/roleService.js';

describe('findForbiddenWorkspaceRolePermission', () => {
  it('returns null for board/workspace permissions', () => {
    expect(findForbiddenWorkspaceRolePermission(['boards.view', 'cards.create'])).toBeNull();
  });

  it('rejects app.* permissions', () => {
    expect(findForbiddenWorkspaceRolePermission(['app.roles.create'])).toBe('app.roles.create');
  });

  it('rejects users.* permissions', () => {
    expect(findForbiddenWorkspaceRolePermission(['users.manage'])).toBe('users.manage');
  });
});
