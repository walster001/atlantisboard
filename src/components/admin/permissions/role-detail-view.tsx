import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToggleSlider } from './toggle-slider';
import { 
  PERMISSION_CATEGORIES, 
  BUILT_IN_ROLES, 
  BUILT_IN_ROLE_PERMISSIONS,
  CustomRole 
} from './types';
import { PermissionKey } from '@/lib/permissions/types';
import { calculateCategoryStatus } from './categories-list';

interface RoleDetailViewProps {
  roleId: string;
  isBuiltIn: boolean;
  isEditable?: boolean;
  selectedCategoryId: string;
  permissions: Set<PermissionKey>;
  hasUnsavedChanges: boolean;
  saving: boolean;
  customRole?: CustomRole;
  onTogglePermission: (permKey: PermissionKey) => void;
  onToggleCategory: () => void;
  onSave: () => void;
  onDelete: () => void;
}

export function RoleDetailView({
  roleId,
  isBuiltIn,
  isEditable = !isBuiltIn,
  selectedCategoryId,
  permissions,
  hasUnsavedChanges,
  saving,
  customRole,
  onTogglePermission,
  onToggleCategory,
  onSave,
  onDelete,
}: RoleDetailViewProps) {
  const category = PERMISSION_CATEGORIES.find(c => c.id === selectedCategoryId);
  const categoryStatus = calculateCategoryStatus(selectedCategoryId, permissions);
  
  // Get role name for display
  const roleName = isBuiltIn
    ? BUILT_IN_ROLES.find(r => r.id === roleId)?.name || roleId
    : customRole?.name || 'Custom Role';

  // Get role description
  const roleDescription = isBuiltIn
    ? BUILT_IN_ROLES.find(r => r.id === roleId)?.description
    : customRole?.description;

  // Get permissions to display (built-in roles use predefined permissions)
  const displayPermissions = isBuiltIn
    ? BUILT_IN_ROLE_PERMISSIONS[roleId] || new Set<PermissionKey>()
    : permissions;

  // Determine if toggles should be disabled
  const togglesDisabled = !isEditable;

  if (!category) return null;

  return (
    <div className="flex-1 min-w-0 bg-card border border-border rounded-lg p-6 flex flex-col">
      <div className="min-w-[20rem] flex-1 flex flex-col">
        {/* Header with role name and actions */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold">{roleName}</h3>
              {isBuiltIn ? (
                isEditable ? (
                  <Badge className="text-xs bg-amber-500/15 text-amber-600 hover:bg-amber-500/20">
                    App Admin Editable
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Read-only</Badge>
                )
              ) : (
                <Badge className="text-xs bg-green-500/15 text-green-600 hover:bg-green-500/20">
                  Editable
                </Badge>
              )}
            </div>
            {roleDescription && (
              <p className="text-sm text-muted-foreground">{roleDescription}</p>
            )}
          </div>
          
          {(isEditable && !isBuiltIn) && (
            <div className="flex items-center gap-3">
              {hasUnsavedChanges && (
                <span className="text-sm text-destructive font-medium">
                  ● Unsaved changes
                </span>
              )}
              <Button
                onClick={onSave}
                disabled={saving || !hasUnsavedChanges}
                size="sm"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Role
              </Button>
            </div>
          )}
        </div>

        {/* Category Header with toggle */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg mb-4">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">{category.name}</span>
            {/* Show note for Board Admin */}
            {roleId === 'admin' && isBuiltIn && (
              <span className="text-xs text-muted-foreground">
                Board Admins have all board-level permissions by default
              </span>
            )}
          </div>
          <ToggleSlider
            state={categoryStatus}
            disabled={togglesDisabled}
            onChange={onToggleCategory}
          />
        </div>

        {/* Permission Items */}
        <div className="flex-1 flex flex-col gap-2">
          {category.permissions.map((perm) => {
            const isEnabled = displayPermissions.has(perm.key);
            
            return (
              <div
                key={perm.key}
                className="flex items-center justify-between p-4 bg-background border border-border rounded-md hover:bg-muted transition-colors"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium font-mono">
                    {perm.key}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {perm.description}
                  </span>
                </div>
                <ToggleSlider
                  state={isEnabled ? 'on' : 'off'}
                  disabled={isBuiltIn}
                  onChange={() => onTogglePermission(perm.key)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
