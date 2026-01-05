import { 
  validateClientPermissions,
  generatePermissionMatrix,
  formatPermissionMatrixAsTable,
  testClientPermissionsForRole,
  getExpectedPermissions,
  runPermissionTests,
  getServerUserPermissions,
} from './testing';
import { ALL_PERMISSIONS, APP_PERMISSIONS, BoardRole } from './types';
import { api } from '@/integrations/api/client';

export function runClientValidation(): void {
  console.log('\n🔍 PERMISSION SYSTEM VALIDATION');
  console.log('================================\n');
  
  // 1. Validate client-side permissions
  console.log('📋 Client-Side Permission Validation:');
  const validation = validateClientPermissions();
  
  if (validation.valid) {
    console.log('   ✅ All client-side validations passed!');
  } else {
    console.log('   ❌ Issues found:');
    validation.issues.forEach(issue => console.log(`      - ${issue}`));
  }
  
  // 2. Show role permission counts
  console.log('\n📊 Permission Counts by Role:');
  const roles: (BoardRole | null)[] = ['admin', 'manager', 'viewer', null];
  const roleLabels = ['Admin', 'Manager', 'Viewer', 'No Role'];
  
  roles.forEach((role, i) => {
    const perms = testClientPermissionsForRole(role, false);
    const count = Object.values(perms).filter(Boolean).length;
    console.log(`   ${roleLabels[i]}: ${count}/${ALL_PERMISSIONS.length} permissions`);
  });
  
  // App admin
  const appAdminPerms = testClientPermissionsForRole('admin', true);
  const appAdminCount = Object.values(appAdminPerms).filter(Boolean).length;
  console.log(`   App Admin: ${appAdminCount}/${ALL_PERMISSIONS.length} permissions`);
  
  // 3. Show expected permissions per role
  console.log('\n📝 Expected Permissions Registry:');
  const expected = getExpectedPermissions();
  Object.entries(expected).forEach(([role, perms]) => {
    console.log(`   ${role}: ${perms.length} permissions`);
  });
  
  // 4. Print full matrix
  console.log('\n📊 Full Permission Matrix:');
  console.log(formatPermissionMatrixAsTable());
}

export async function runServerValidation(): Promise<void> {
  console.log('\n🔐 SERVER-SIDE PERMISSION VALIDATION');
  console.log('=====================================\n');
  
  // Get current user
  const { data: { session } } = await api.auth.getSession();
  
  if (!session?.user) {
    console.log('   ❌ No authenticated user. Please log in first.');
    return;
  }
  
  const user = session.user;
  console.log(`   👤 User: ${user.email}`);
  console.log(`   🆔 ID: ${user.id}`);
  
  // Check if app admin
  const { data: profile } = await api
    .from('profiles')
    .select('isAdmin')
    .eq('id', user.id)
    .single();
  
  console.log(`   👑 App Admin: ${profile?.isAdmin ? 'Yes' : 'No'}`);
  
  // Get app-level permissions
  console.log('\n   📋 App-Level Permissions (no board context):');
  const appPerms = await getServerUserPermissions(user.id);
  
  if (appPerms.error) {
    console.log(`   ❌ Error: ${appPerms.error}`);
  } else {
    const appLevelPerms = appPerms.permissions.filter(p => 
      (APP_PERMISSIONS as readonly string[]).includes(p)
    );
    console.log(`   ✅ Has ${appLevelPerms.length} app permissions`);
    appLevelPerms.forEach(p => console.log(`      - ${p}`));
  }
  
  // Get boards user has access to
  console.log('\n   📋 Checking Board Access:');
  const { data: boards } = await api
    .from('board_members')
    .select('boardId, role, boards(name)')
    .eq('userId', user.id)
    .limit(3);
  
  if (!boards || boards.length === 0) {
    console.log('   ℹ️ No board memberships found.');
    return;
  }
  
  for (const membership of boards) {
    const boardName = (membership.boards as { name?: string } | null)?.name || 'Unknown';
    console.log(`\n   📌 Board: ${boardName}`);
    console.log(`      Role: ${membership.role}`);
    
    const boardPerms = await getServerUserPermissions(user.id, membership.boardId);
    const boardLevelPerms = boardPerms.permissions.filter(p => 
      !(APP_PERMISSIONS as readonly string[]).includes(p)
    );
    
    console.log(`      Permissions: ${boardLevelPerms.length}`);
    
    // Compare with client
    const clientPerms = testClientPermissionsForRole(membership.role as BoardRole, profile?.isAdmin ?? false);
    const clientPermList = Object.entries(clientPerms)
      .filter(([_, v]) => v)
      .map(([k]) => k)
      .filter(p => !(APP_PERMISSIONS as readonly string[]).includes(p));
    
    const serverSet = new Set<string>(boardLevelPerms);
    const clientSet = new Set<string>(clientPermList);
    
    const missingOnServer = clientPermList.filter(p => !serverSet.has(p));
    const extraOnServer = boardLevelPerms.filter(p => !clientSet.has(p));
    
    if (missingOnServer.length === 0 && extraOnServer.length === 0) {
      console.log(`      ✅ Client and server permissions match!`);
    } else {
      if (missingOnServer.length > 0) {
        console.log(`      ⚠️ Client expects but server missing: ${missingOnServer.join(', ')}`);
      }
      if (extraOnServer.length > 0) {
        console.log(`      ⚠️ Server has but client missing: ${extraOnServer.join(', ')}`);
      }
    }
  }
}

export async function runAllPermissionTests(): Promise<void> {
  console.clear();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           PERMISSION SYSTEM TEST SUITE                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  // Run client validation
  runClientValidation();
  
  // Run server validation
  await runServerValidation();
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ Test suite complete!');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

// Auto-register on window for easy console access
interface PermissionTestWindow {
  permissionTests?: {
    runAll: () => Promise<void>;
    runClient: () => void;
    runServer: () => Promise<void>;
    validateClient: () => { valid: boolean; issues: string[] };
    getMatrix: () => ReturnType<typeof generatePermissionMatrix>;
    printMatrix: () => void;
  };
}

if (typeof window !== 'undefined') {
  (window as Window & PermissionTestWindow).permissionTests = {
    runAll: runAllPermissionTests,
    runClient: runClientValidation,
    runServer: runServerValidation,
    validateClient: validateClientPermissions,
    getMatrix: generatePermissionMatrix,
    printMatrix: () => console.log(formatPermissionMatrixAsTable()),
  };
  
  console.log('📋 Permission tests available: window.permissionTests.runAll()');
}
