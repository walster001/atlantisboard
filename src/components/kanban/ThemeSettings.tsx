import { useState, useEffect } from 'react';
import { api } from '@/integrations/api/client';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Check, Loader2, Trash2, Pencil, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { ThemeEditorModal, BoardTheme } from './ThemeEditorModal';
import { getUserFriendlyError } from '@/lib/errorHandler';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Helper to darken a hex color by a percentage
function darkenColor(hex: string, percent: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  
  const r = Math.max(0, Math.round(parseInt(result[1], 16) * (1 - percent)));
  const g = Math.max(0, Math.round(parseInt(result[2], 16) * (1 - percent)));
  const b = Math.max(0, Math.round(parseInt(result[3], 16) * (1 - percent)));
  
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// Theme order to match Add Board color picker order
const THEME_ORDER = [
  'Ocean Blue',
  'Sunset Orange', 
  'Forest Green',
  'Ruby Red',
  'Royal Purple',
  'Hot Pink',
  'Mint Green',
  'Teal',
];

interface ThemeSettingsProps {
  boardId: string;
  currentThemeId: string | null;
  userRole: 'admin' | 'manager' | 'viewer' | null;
  onThemeApplied: () => void;
}

export function ThemeSettings({ 
  boardId, 
  currentThemeId, 
  userRole,
  onThemeApplied 
}: ThemeSettingsProps) {
  const { toast } = useToast();
  const { isAppAdmin } = useAuth();
  const [themes, setThemes] = useState<BoardTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<BoardTheme | null>(null);
  const [duplicatingTheme, setDuplicatingTheme] = useState<BoardTheme | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [themeToDelete, setThemeToDelete] = useState<BoardTheme | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Use permission system
  const { can } = usePermissions(boardId, userRole);
  const canManageThemes = isAppAdmin; // App-level permission
  const canApplyThemes = can('board.theme.assign');

  useEffect(() => {
    fetchThemes();
  }, []);

  const fetchThemes = async () => {
    setLoading(true);
    try {
      const { data, error } = await api
        .from('board_themes')
        .select('*');

      if (error) throw error;
      
      // Sort themes: default themes in THEME_ORDER first, then custom themes alphabetically
      const allThemes = (data || []) as BoardTheme[];
      const sortedThemes = allThemes.sort((a, b) => {
        const aIsDefault = a.isDefault;
        const bIsDefault = b.isDefault;
        
        if (aIsDefault && bIsDefault) {
          // Both default - sort by THEME_ORDER
          const aIndex = THEME_ORDER.indexOf(a.name);
          const bIndex = THEME_ORDER.indexOf(b.name);
          return aIndex - bIndex;
        }
        if (aIsDefault && !bIsDefault) return -1;
        if (!aIsDefault && bIsDefault) return 1;
        // Both custom - sort alphabetically
        return a.name.localeCompare(b.name);
      });
      
      setThemes(sortedThemes);
    } catch (error: any) {
      console.error('Fetch themes error:', error);
      toast({ title: 'Error', description: 'Failed to load themes', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const applyTheme = async (themeId: string | null, theme?: BoardTheme) => {
    if (!canApplyThemes) return;
    
    setApplying(themeId || 'none');
    try {
      // Calculate background color - slightly darker than navbar for good contrast
      let backgroundColorUpdate: string | null = null;
      if (theme) {
        // Darken navbar color by 10% for the background
        backgroundColorUpdate = darkenColor(theme.navbarColor, 0.1);
      }
      
      const updateData: { themeId: string | null; backgroundColor?: string } = { 
        themeId: themeId 
      };
      if (backgroundColorUpdate) {
        updateData.backgroundColor = backgroundColorUpdate;
      }
      
      const { error } = await api
        .from('boards')
        .eq('id', boardId)
        .update(updateData);

      if (error) throw error;
      toast({ title: themeId ? 'Theme applied' : 'Theme removed' });
      onThemeApplied();
    } catch (error: any) {
      console.error('Apply theme error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setApplying(null);
    }
  };

  const handleEditTheme = (theme: BoardTheme) => {
    setEditingTheme(theme);
    setDuplicatingTheme(null);
    setEditorOpen(true);
  };

  const handleDuplicateTheme = (theme: BoardTheme) => {
    setDuplicatingTheme(theme);
    setEditingTheme(null);
    setEditorOpen(true);
  };

  const handleDeleteTheme = (theme: BoardTheme) => {
    setThemeToDelete(theme);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteTheme = async () => {
    if (!themeToDelete) return;
    
    setDeleting(true);
    try {
      const { error } = await api
        .from('board_themes')
        .eq('id', themeToDelete.id)
        .delete();

      if (error) throw error;
      toast({ title: 'Theme deleted' });
      fetchThemes();
    } catch (error: any) {
      console.error('Delete theme error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
      setThemeToDelete(null);
    }
  };

  const handleThemeSaved = () => {
    fetchThemes();
    setEditingTheme(null);
    setDuplicatingTheme(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-1">Board Themes</h3>
          <p className="text-sm text-muted-foreground">
            {canApplyThemes 
              ? 'Select a theme to apply to this board.' 
              : 'View available board themes.'}
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-4">

            {/* Theme tiles */}
            {themes.map((theme) => {
              const isSelected = currentThemeId === theme.id;
              
              return (
                <div
                  key={theme.id}
                  className={cn(
                    "relative group rounded-lg border-2 transition-all",
                    isSelected 
                      ? "border-primary ring-2 ring-primary/20" 
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <button
                    onClick={() => canApplyThemes && !isSelected && applyTheme(theme.id, theme)}
                    disabled={!canApplyThemes || applying !== null}
                    className="w-full p-2 text-left"
                  >
                    {/* Theme preview */}
                    <div 
                      className="aspect-[4/3] rounded overflow-hidden mb-2 relative"
                      style={{ backgroundColor: theme.columnColor }}
                    >
                      {/* Mini navbar */}
                      <div 
                        className="h-4 flex items-center px-1.5 gap-1"
                        style={{ backgroundColor: theme.navbarColor }}
                      >
                        <div 
                          className="h-2 w-2 rounded-sm"
                          style={{ backgroundColor: theme.boardIconColor }}
                        />
                        <div 
                          className="h-1 w-6 rounded"
                          style={{ backgroundColor: theme.boardIconColor, opacity: 0.7 }}
                        />
                      </div>
                      {/* Mini columns */}
                      <div className="p-1.5 flex gap-1">
                        <div 
                          className="flex-1 rounded p-1 space-y-0.5"
                          style={{ backgroundColor: theme.columnColor }}
                        >
                          <div 
                            className="h-3 rounded shadow-sm"
                            style={{ backgroundColor: theme.defaultCardColor || '#ffffff' }}
                          />
                          <div 
                            className="h-3 rounded shadow-sm"
                            style={{ backgroundColor: theme.defaultCardColor || '#ffffff' }}
                          />
                        </div>
                        <div 
                          className="flex-1 rounded p-1 space-y-0.5"
                          style={{ backgroundColor: theme.columnColor }}
                        >
                          <div 
                            className="h-3 rounded shadow-sm"
                            style={{ backgroundColor: theme.defaultCardColor || '#ffffff' }}
                          />
                        </div>
                      </div>
                      
                      {/* Selected overlay */}
                      {isSelected && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-5 w-5 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <p className="text-sm font-medium truncate flex-1">{theme.name}</p>
                      {applying === theme.id && (
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      )}
                    </div>
                    {theme.isDefault && (
                      <p className="text-xs text-muted-foreground">Default</p>
                    )}
                  </button>


                  {/* Duplicate action for app admins (available on all themes) */}
                  {canManageThemes && (
                    <div className={`absolute top-1 ${theme.isDefault ? 'left-1' : 'right-1'} flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-6 w-6"
                        title="Duplicate theme"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateTheme(theme);
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}

                  {/* Edit/Delete actions for app admins (custom themes only) */}
                  {canManageThemes && !theme.isDefault && (
                    <div className="absolute top-1 left-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-6 w-6"
                        title="Edit theme"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditTheme(theme);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-6 w-6 hover:bg-destructive hover:text-destructive-foreground"
                        title="Delete theme"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTheme(theme);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add Theme tile (app admins only) */}
            {canManageThemes && (
              <button
                onClick={() => {
                  setEditingTheme(null);
                  setEditorOpen(true);
                }}
                className="p-2 rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-all text-left"
              >
                <div className="aspect-[4/3] rounded bg-muted/50 flex items-center justify-center mb-2">
                  <Plus className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Add Theme</p>
              </button>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Theme Editor Modal */}
      <ThemeEditorModal
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingTheme(null);
          setDuplicatingTheme(null);
        }}
        onThemeSaved={handleThemeSaved}
        editingTheme={editingTheme}
        duplicatingTheme={duplicatingTheme}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Theme</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "<strong>{themeToDelete?.name}</strong>"? 
              Boards using this theme will revert to no theme.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTheme}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
