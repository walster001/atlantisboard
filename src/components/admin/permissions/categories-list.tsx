import { 
  Settings, Palette, LayoutGrid, Trello, Settings2, 
  Users, Columns3, StickyNote, Tag, Paperclip, CheckSquare, Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PERMISSION_CATEGORIES, CategoryStatus, PermissionCategoryConfig } from './types';
import { PermissionKey } from '@/lib/permissions/types';

const iconMap: Record<string, React.ComponentType<{ className?: string | undefined }>> = {
  Settings: Settings as React.ComponentType<{ className?: string | undefined }>,
  Palette: Palette as React.ComponentType<{ className?: string | undefined }>,
  LayoutGrid: LayoutGrid as React.ComponentType<{ className?: string | undefined }>,
  Trello: Trello as React.ComponentType<{ className?: string | undefined }>,
  Settings2: Settings2 as React.ComponentType<{ className?: string | undefined }>,
  Users: Users as React.ComponentType<{ className?: string | undefined }>,
  Columns3: Columns3 as React.ComponentType<{ className?: string | undefined }>,
  StickyNote: StickyNote as React.ComponentType<{ className?: string | undefined }>,
  Tag: Tag as React.ComponentType<{ className?: string | undefined }>,
  Paperclip: Paperclip as React.ComponentType<{ className?: string | undefined }>,
  CheckSquare: CheckSquare as React.ComponentType<{ className?: string | undefined }>,
};

interface CategoriesListProps {
  selectedCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
  getCategoryStatus: (categoryId: string) => CategoryStatus;
  categories?: PermissionCategoryConfig[];
}

export function CategoriesList({
  selectedCategoryId,
  onSelectCategory,
  getCategoryStatus,
  categories,
}: CategoriesListProps) {
  // Use provided categories or default to all
  const categoriesToShow = categories || PERMISSION_CATEGORIES;
  
  // Split into app-level and board-level
  const appLevelCategories = categoriesToShow.filter(c => 
    c.id === 'app-admin' || c.id === 'themes' || c.id === 'workspaces'
  );
  const boardLevelCategories = categoriesToShow.filter(c => 
    c.id !== 'app-admin' && c.id !== 'themes' && c.id !== 'workspaces'
  );

  return (
    <div className="w-48 shrink-0 flex flex-col">
      <div className="bg-card border border-border rounded-lg p-4 flex-1">
        {/* App-Level Permissions Section (only if there are app-level categories) */}
        {appLevelCategories.length > 0 && (
          <>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-amber-500" />
              App Permissions
            </div>
            <div className="flex flex-col gap-1 mb-4">
              {appLevelCategories.map((category) => {
                const Icon = iconMap[category.icon] || Settings;
                const status = getCategoryStatus(category.id);
                
                return (
                  <button
                    key={category.id}
                    onClick={() => onSelectCategory(category.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md text-[13px] font-medium transition-colors w-full text-left",
                      selectedCategoryId === category.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 opacity-70" />
                    <span className="flex-1 truncate">{category.name}</span>
                    <StatusIndicator 
                      status={status} 
                      isSelected={selectedCategoryId === category.id}
                    />
                  </button>
                );
              })}
            </div>
            {boardLevelCategories.length > 0 && <div className="h-px bg-border mb-4" />}
          </>
        )}
        
        {/* Board-Level Permissions Section */}
        {boardLevelCategories.length > 0 && (
          <>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Board Permissions
            </div>
            <div className="flex flex-col gap-1">
              {boardLevelCategories.map((category) => {
                const Icon = iconMap[category.icon] || Settings;
                const status = getCategoryStatus(category.id);
                
                return (
                  <button
                    key={category.id}
                    onClick={() => onSelectCategory(category.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md text-[13px] font-medium transition-colors w-full text-left",
                      selectedCategoryId === category.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 opacity-70" />
                    <span className="flex-1 truncate">{category.name}</span>
                    <StatusIndicator 
                      status={status} 
                      isSelected={selectedCategoryId === category.id}
                    />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusIndicator({ status, isSelected }: { status: CategoryStatus; isSelected: boolean }) {
  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full shrink-0",
        status === 'on' && "bg-green-500",
        status === 'partial' && "bg-yellow-500",
        status === 'off' && "bg-muted-foreground/30",
        isSelected && "ring-1 ring-primary-foreground/50"
      )}
    />
  );
}

// Helper function to calculate category status
export function calculateCategoryStatus(
  categoryId: string,
  permissions: Set<PermissionKey>
): CategoryStatus {
  const category = PERMISSION_CATEGORIES.find(c => c.id === categoryId);
  if (!category) return 'off';

  const categoryPerms = category.permissions.map(p => p.key);
  const enabledCount = categoryPerms.filter(key => permissions.has(key)).length;

  if (enabledCount === 0) return 'off';
  if (enabledCount === categoryPerms.length) return 'on';
  return 'partial';
}
