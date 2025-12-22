import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { ListTodo, Plus, Trash2, Loader2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

export interface Subtask {
  id: string;
  card_id: string;
  title: string;
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  position: number;
  checklist_name: string | null;
  created_at: string;
}

interface CardSubtaskSectionProps {
  cardId: string;
  subtasks: Subtask[];
  onSubtasksChange: () => void;
  disabled?: boolean;
  themeTextColor?: string;
  themeButtonColor?: string;
  themeButtonTextColor?: string;
  themeButtonHoverColor?: string;
  themeButtonHoverTextColor?: string;
}

export function CardSubtaskSection({
  cardId,
  subtasks,
  onSubtasksChange,
  disabled = false,
  themeTextColor,
  themeButtonColor,
  themeButtonTextColor,
  themeButtonHoverColor,
  themeButtonHoverTextColor,
}: CardSubtaskSectionProps) {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Calculate progress
  const completedCount = subtasks.filter(s => s.completed).length;
  const totalCount = subtasks.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const handleAddSubtask = async () => {
    if (!newTitle.trim()) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get the max position
      const maxPosition = subtasks.reduce((max, s) => Math.max(max, s.position), -1);

      const { error } = await supabase
        .from('card_subtasks')
        .insert({
          card_id: cardId,
          title: newTitle.trim(),
          position: maxPosition + 1,
        });

      if (error) throw error;

      setNewTitle('');
      setIsAdding(false);
      onSubtasksChange();
      toast({ title: 'Subtask added' });
    } catch (error: any) {
      toast({
        title: 'Error adding subtask',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSubtask = async (subtask: Subtask) => {
    setTogglingId(subtask.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('card_subtasks')
        .update({
          completed: !subtask.completed,
          completed_at: !subtask.completed ? new Date().toISOString() : null,
          completed_by: !subtask.completed ? user?.id : null,
        })
        .eq('id', subtask.id);

      if (error) throw error;

      onSubtasksChange();
    } catch (error: any) {
      toast({
        title: 'Error updating subtask',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    try {
      const { error } = await supabase
        .from('card_subtasks')
        .delete()
        .eq('id', subtaskId);

      if (error) throw error;

      onSubtasksChange();
      toast({ title: 'Subtask deleted' });
    } catch (error: any) {
      toast({
        title: 'Error deleting subtask',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Check if custom button colors are provided
  const hasCustomButtonColors = !!themeButtonColor;
  
  // Button style for themed buttons
  const buttonStyle: React.CSSProperties = hasCustomButtonColors ? {
    backgroundColor: themeButtonColor,
    color: themeButtonTextColor || '#ffffff',
    borderColor: themeButtonColor,
  } : {};
  
  // Button class for hover states
  const themedButtonClass = hasCustomButtonColors ? 'themed-button' : '';
  
  // CSS custom properties for container
  const containerStyle: React.CSSProperties = hasCustomButtonColors ? {
    '--theme-btn-bg': themeButtonColor,
    '--theme-btn-color': themeButtonTextColor || '#ffffff',
    '--theme-btn-hover-bg': themeButtonHoverColor || themeButtonColor,
    '--theme-btn-hover-color': themeButtonHoverTextColor || themeButtonTextColor || '#ffffff',
  } as React.CSSProperties : {};

  // Sort subtasks by position
  const sortedSubtasks = [...subtasks].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-2" style={containerStyle}>
      <div className="flex items-center justify-between">
        <div 
          className={cn("flex items-center gap-2", !themeTextColor && "text-muted-foreground")}
          style={themeTextColor ? { color: themeTextColor, opacity: 0.7 } : undefined}
        >
          <ListTodo className="h-4 w-4" />
          <span className="text-sm font-medium">
            Checklist {totalCount > 0 && `(${completedCount}/${totalCount})`}
          </span>
        </div>
        {!disabled && !isAdding && (
          <Button
            variant={hasCustomButtonColors ? "default" : "outline"}
            size="sm"
            onClick={() => setIsAdding(true)}
            className={cn("h-8", themedButtonClass)}
            style={hasCustomButtonColors ? buttonStyle : undefined}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Item
          </Button>
        )}
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="space-y-1">
          <Progress 
            value={progressPercent} 
            className="h-2"
          />
        </div>
      )}

      {/* Add new subtask input */}
      {isAdding && !disabled && (
        <div className="flex items-center gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Enter subtask title..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddSubtask();
              if (e.key === 'Escape') {
                setIsAdding(false);
                setNewTitle('');
              }
            }}
            disabled={saving}
          />
          <Button
            size="sm"
            onClick={handleAddSubtask}
            disabled={!newTitle.trim() || saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsAdding(false);
              setNewTitle('');
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Subtasks list */}
      {sortedSubtasks.length === 0 ? (
        <div className="text-sm text-muted-foreground italic py-2">
          {disabled ? 'No checklist items' : 'No checklist items yet. Click Add Item to create one.'}
        </div>
      ) : (
        <div className="space-y-1">
          {sortedSubtasks.map((subtask) => (
            <div
              key={subtask.id}
              className={cn(
                "flex items-center gap-3 p-2 rounded-lg transition-colors group",
                !themeTextColor && "hover:bg-muted/50",
                subtask.completed && "opacity-60"
              )}
              style={themeTextColor ? {
                backgroundColor: 'transparent',
              } : undefined}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Checkbox
                  id={subtask.id}
                  checked={subtask.completed}
                  onCheckedChange={() => !disabled && handleToggleSubtask(subtask)}
                  disabled={disabled || togglingId === subtask.id}
                  className={cn(
                    togglingId === subtask.id && "opacity-50"
                  )}
                />
                <label
                  htmlFor={subtask.id}
                  className={cn(
                    "text-sm flex-1 cursor-pointer select-none truncate",
                    subtask.completed && "line-through text-muted-foreground"
                  )}
                  style={themeTextColor && !subtask.completed ? { color: themeTextColor } : undefined}
                >
                  {subtask.title}
                </label>
              </div>

              {!disabled && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                  onClick={() => handleDeleteSubtask(subtask.id)}
                  title="Delete subtask"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
