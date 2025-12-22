/**
 * Categories List Component
 * Displays permission categories with status indicators
 */

import { 
  Settings, Palette, LayoutGrid, Trello, Settings2, 
  Users, Columns3, StickyNote, Tag, Paperclip, CheckSquare 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PERMISSION_CATEGORIES, CategoryStatus, PermissionCategoryConfig } from './types';
import { PermissionKey } from '@/lib/permissions/types';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Settings,
  Palette,
  LayoutGrid,
  Trello,
  Settings2,
  Users,
  Columns3,
  StickyNote,
  Tag,
  Paperclip,
  CheckSquare,
};

interface CategoriesListProps {
  selectedCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
  getCategoryStatus: (categoryId: string) => CategoryStatus;
}

export function CategoriesList({
  selectedCategoryId,
  onSelectCategory,
  getCategoryStatus,
}: CategoriesListProps) {
  return (
    <div className="w-48 shrink-0 flex flex-col">
      <div className="bg-card border border-border rounded-lg p-4 flex-1">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Permission Categories
        </div>
        <div className="flex flex-col gap-1">
          {PERMISSION_CATEGORIES.map((category) => {
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
