/**
 * Roles List Component
 * Displays built-in and custom roles in vertical tabs
 */

import { Lock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BUILT_IN_ROLES, CustomRole, BuiltInRole } from './types';

interface RolesListProps {
  customRoles: CustomRole[];
  selectedRoleId: string | null;
  selectedRoleIsBuiltIn: boolean;
  onSelectRole: (roleId: string, isBuiltIn: boolean) => void;
  onAddRole: () => void;
}

export function RolesList({
  customRoles,
  selectedRoleId,
  selectedRoleIsBuiltIn,
  onSelectRole,
  onAddRole,
}: RolesListProps) {
  return (
    <div className="w-44 shrink-0 flex flex-col gap-2">
      <div className="bg-card border border-border rounded-lg p-4">
        {/* Built-in Roles */}
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Built-in Roles
        </div>
        <div className="flex flex-col gap-1">
          {BUILT_IN_ROLES.map((role) => (
            <button
              key={role.id}
              onClick={() => onSelectRole(role.id, true)}
              className={cn(
                "flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors w-full text-left",
                selectedRoleId === role.id && selectedRoleIsBuiltIn
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span>{role.name}</span>
              <Lock className={cn(
                "h-3 w-3",
                selectedRoleId === role.id && selectedRoleIsBuiltIn
                  ? "opacity-80"
                  : "opacity-50"
              )} />
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="h-px bg-border my-3" />

        {/* Add Custom Role Button */}
        <Button
          variant="outline"
          className="w-fit gap-2 border-dashed border-primary text-primary hover:bg-primary/10 mb-3"
          onClick={onAddRole}
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap">Add Custom Role</span>
        </Button>

        {/* Custom Roles */}
        {customRoles.length > 0 && (
          <>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Custom Roles
            </div>
            <div className="flex flex-col gap-1">
              {customRoles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => onSelectRole(role.id, false)}
                  className={cn(
                    "flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors w-full text-left",
                    selectedRoleId === role.id && !selectedRoleIsBuiltIn
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span className="truncate">{role.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
