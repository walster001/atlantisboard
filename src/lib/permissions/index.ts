// Auto-run tests in development
import './runTests';

/**
 * Permission System
 * 
 * Centralized permission management for the application.
 * 
 * Usage:
 * ```typescript
 * import { hasPermission, createPermissionContext } from '@/lib/permissions';
 * 
 * const context = createPermissionContext(user?.id, isAppAdmin, boardId, userRole);
 * if (hasPermission(context, 'card.create')) {
 *   // User can create cards
 * }
 * ```
 * 
 * Or use the React hook:
 * ```typescript
 * import { usePermissions } from '@/hooks/usePermissions';
 * 
 * const { can, canAll, canAny } = usePermissions(boardId, userRole);
 * if (can('card.create')) {
 *   // User can create cards
 * }
 * ```
 */

// Export types
export * from './types';

// Export registry
export {
  PERMISSION_METADATA,
  DEFAULT_ROLE_PERMISSIONS,
  APP_ADMIN_PERMISSIONS,
  getPermissionsByCategory,
  requiresBoardContext,
} from './registry';

// Export resolver functions
export {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getAllPermissions,
  createPermissionContext,
  canEdit,
  canManageMembers,
  canChangeRoles,
} from './resolver';

// Export testing utilities (for development/debugging)
export {
  validateClientPermissions,
  testClientPermissionsForRole,
  getExpectedPermissions,
  testServerPermission,
  getServerUserPermissions,
  runPermissionTests,
  generatePermissionMatrix,
  formatPermissionMatrixAsTable,
  type PermissionTestResult,
  type PermissionTestSummary,
} from './testing';
