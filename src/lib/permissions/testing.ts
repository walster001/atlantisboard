/**
 * Permission Testing Utilities
 * 
 * This module provides utilities for validating the permission system,
 * ensuring server-side and client-side permission resolution match,
 * and testing all permissions across all roles.
 */

import { supabase } from '@/integrations/supabase/client';
import { 
  PermissionKey, 
  ALL_PERMISSIONS,
  APP_PERMISSIONS,
  BoardRole 
} from './types';
import { 
  hasPermission, 
  createPermissionContext,
  DEFAULT_ROLE_PERMISSIONS,
  APP_ADMIN_PERMISSIONS 
} from './index';

// ============================================================================
// TEST RESULT TYPES
// ============================================================================

export interface PermissionTestResult {
  permission: PermissionKey;
  role: BoardRole | 'app_admin' | 'no_role';
  clientResult: boolean;
  serverResult: boolean | null;
  match: boolean;
  error?: string;
}

export interface PermissionTestSummary {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  results: PermissionTestResult[];
  clientServerMismatches: PermissionTestResult[];
  duration: number;
}

// ============================================================================
// CLIENT-SIDE VALIDATION
// ============================================================================

/**
 * Test all permissions for a specific role using client-side resolver.
 * This validates the DEFAULT_ROLE_PERMISSIONS mapping is correct.
 */
export function testClientPermissionsForRole(
  role: BoardRole | null,
  isAppAdmin: boolean = false
): Record<PermissionKey, boolean> {
  const context = createPermissionContext(
    'test-user-id',
    isAppAdmin,
    'test-board-id',
    role
  );

  const results: Record<string, boolean> = {};
  
  for (const permission of ALL_PERMISSIONS) {
    results[permission] = hasPermission(context, permission);
  }
  
  return results as Record<PermissionKey, boolean>;
}

/**
 * Get expected permissions for each role based on DEFAULT_ROLE_PERMISSIONS.
 */
export function getExpectedPermissions(): Record<BoardRole | 'app_admin', PermissionKey[]> {
  return {
    admin: Array.from(DEFAULT_ROLE_PERMISSIONS.admin),
    manager: Array.from(DEFAULT_ROLE_PERMISSIONS.manager),
    viewer: Array.from(DEFAULT_ROLE_PERMISSIONS.viewer),
    app_admin: [
      ...Array.from(APP_ADMIN_PERMISSIONS),
      ...Array.from(DEFAULT_ROLE_PERMISSIONS.admin), // App admins get all board permissions too
    ],
  };
}

/**
 * Validate that client-side permission resolution is internally consistent.
 */
export function validateClientPermissions(): { 
  valid: boolean; 
  issues: string[] 
} {
  const issues: string[] = [];
  
  // Test 1: Admin should have all board-level permissions
  const adminResults = testClientPermissionsForRole('admin', false);
  const boardPermissions = ALL_PERMISSIONS.filter(
    p => !(APP_PERMISSIONS as readonly string[]).includes(p)
  );
  
  for (const perm of boardPermissions) {
    if (!adminResults[perm]) {
      issues.push(`Admin missing expected permission: ${perm}`);
    }
  }
  
  // Test 2: Viewer permissions should be subset of manager
  const viewerResults = testClientPermissionsForRole('viewer', false);
  const managerResults = testClientPermissionsForRole('manager', false);
  
  for (const [perm, hasIt] of Object.entries(viewerResults)) {
    if (hasIt && !managerResults[perm as PermissionKey]) {
      issues.push(`Viewer has ${perm} but manager doesn't - hierarchy violation`);
    }
  }
  
  // Test 3: Manager permissions should be subset of admin (for board permissions)
  for (const [perm, hasIt] of Object.entries(managerResults)) {
    if (hasIt && !adminResults[perm as PermissionKey]) {
      issues.push(`Manager has ${perm} but admin doesn't - hierarchy violation`);
    }
  }
  
  // Test 4: App admin should have all app-level permissions
  const appAdminResults = testClientPermissionsForRole('admin', true);
  for (const perm of APP_PERMISSIONS) {
    if (!appAdminResults[perm]) {
      issues.push(`App admin missing expected app permission: ${perm}`);
    }
  }
  
  // Test 5: Non-app-admin should NOT have app-level permissions
  for (const perm of APP_PERMISSIONS) {
    if (adminResults[perm]) {
      issues.push(`Board admin incorrectly has app permission: ${perm}`);
    }
  }
  
  // Test 6: No role should have no permissions (except viewing)
  const noRoleResults = testClientPermissionsForRole(null, false);
  for (const [perm, hasIt] of Object.entries(noRoleResults)) {
    if (hasIt) {
      issues.push(`User with no role has permission: ${perm}`);
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
  };
}

// ============================================================================
// SERVER-SIDE VALIDATION
// ============================================================================

/**
 * Test a single permission against the server-side has_permission function.
 * Requires an authenticated user with actual board access.
 */
export async function testServerPermission(
  userId: string,
  boardId: string,
  permission: PermissionKey
): Promise<{ hasPermission: boolean; error?: string }> {
  try {
    // Cast permission to the expected type
    const { data, error } = await supabase.rpc('has_permission', {
      _user_id: userId,
      _permission: permission as any,
      _board_id: boardId,
    });

    if (error) {
      return { hasPermission: false, error: error.message };
    }

    return { hasPermission: data ?? false };
  } catch (e) {
    return { hasPermission: false, error: String(e) };
  }
}

/**
 * Get all permissions for a user from the server.
 */
export async function getServerUserPermissions(
  userId: string,
  boardId?: string
): Promise<{ permissions: PermissionKey[]; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('get_user_permissions', {
      _user_id: userId,
      _board_id: boardId ?? null,
    });

    if (error) {
      return { permissions: [], error: error.message };
    }

    return { permissions: (data ?? []) as PermissionKey[] };
  } catch (e) {
    return { permissions: [], error: String(e) };
  }
}

// ============================================================================
// COMPREHENSIVE TESTING
// ============================================================================

/**
 * Run comprehensive permission tests comparing client and server.
 * This is for development/debugging only - not for production use.
 */
export async function runPermissionTests(
  userId: string,
  boardId: string,
  boardRole: BoardRole
): Promise<PermissionTestSummary> {
  const startTime = Date.now();
  const results: PermissionTestResult[] = [];
  
  // Get server permissions once
  const serverPerms = await getServerUserPermissions(userId, boardId);
  const serverPermSet = new Set(serverPerms.permissions);
  
  // Get client permissions
  const clientResults = testClientPermissionsForRole(boardRole, false);
  
  // Compare each permission
  for (const permission of ALL_PERMISSIONS) {
    // Skip app permissions for non-app-admin tests
    if ((APP_PERMISSIONS as readonly string[]).includes(permission)) {
      results.push({
        permission,
        role: boardRole,
        clientResult: clientResults[permission],
        serverResult: null,
        match: true, // Skip app permissions in board context
      });
      continue;
    }
    
    const clientResult = clientResults[permission];
    const serverResult = serverPermSet.has(permission);
    
    results.push({
      permission,
      role: boardRole,
      clientResult,
      serverResult,
      match: clientResult === serverResult,
      error: serverPerms.error,
    });
  }
  
  const mismatches = results.filter(r => !r.match && r.serverResult !== null);
  
  return {
    totalTests: results.length,
    passed: results.filter(r => r.match).length,
    failed: mismatches.length,
    skipped: results.filter(r => r.serverResult === null).length,
    results,
    clientServerMismatches: mismatches,
    duration: Date.now() - startTime,
  };
}

// ============================================================================
// PERMISSION MATRIX
// ============================================================================

/**
 * Generate a complete permission matrix for documentation/testing.
 */
export function generatePermissionMatrix(): Record<PermissionKey, {
  admin: boolean;
  manager: boolean;
  viewer: boolean;
  appAdminOnly: boolean;
  requiresBoard: boolean;
}> {
  const adminResults = testClientPermissionsForRole('admin', false);
  const managerResults = testClientPermissionsForRole('manager', false);
  const viewerResults = testClientPermissionsForRole('viewer', false);
  
  const matrix: Record<string, any> = {};
  
  for (const permission of ALL_PERMISSIONS) {
    matrix[permission] = {
      admin: adminResults[permission],
      manager: managerResults[permission],
      viewer: viewerResults[permission],
      appAdminOnly: (APP_PERMISSIONS as readonly string[]).includes(permission),
      requiresBoard: !(APP_PERMISSIONS as readonly string[]).includes(permission),
    };
  }
  
  return matrix as Record<PermissionKey, any>;
}

/**
 * Format permission matrix as a readable table for console output.
 */
export function formatPermissionMatrixAsTable(): string {
  const matrix = generatePermissionMatrix();
  const lines: string[] = [];
  
  lines.push('┌─────────────────────────────────────┬───────┬─────────┬────────┬──────────┐');
  lines.push('│ Permission                          │ Admin │ Manager │ Viewer │ App Only │');
  lines.push('├─────────────────────────────────────┼───────┼─────────┼────────┼──────────┤');
  
  for (const [perm, values] of Object.entries(matrix)) {
    const permName = perm.padEnd(37);
    const admin = values.admin ? '  ✓  ' : '  ✗  ';
    const manager = values.manager ? '   ✓   ' : '   ✗   ';
    const viewer = values.viewer ? '  ✓   ' : '  ✗   ';
    const appOnly = values.appAdminOnly ? '    ✓   ' : '    ✗   ';
    lines.push(`│ ${permName}│${admin}│${manager}│${viewer}│${appOnly}│`);
  }
  
  lines.push('└─────────────────────────────────────┴───────┴─────────┴────────┴──────────┘');
  
  return lines.join('\n');
}
