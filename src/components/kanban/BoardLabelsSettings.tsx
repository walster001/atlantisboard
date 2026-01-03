import { useState } from 'react';
import { api } from '@/integrations/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Pencil, Trash2, Pipette, X, Check } from 'lucide-react';
import { getUserFriendlyError } from '@/lib/errorHandler';
import { LABEL_COLORS, LabelColorName } from '@/types/kanban';
import { cn } from '@/lib/utils';

interface BoardLabel {
  id: string;
  boardId: string;
  name: string;
  color: string;
}

interface BoardLabelsSettingsProps {
  boardId: string;
  labels: BoardLabel[];
  onLabelsChange: () => void;
  disabled?: boolean;
}

const PRESET_LABEL_COLORS: { name: LabelColorName; hex: string }[] = [
  { name: 'red', hex: LABEL_COLORS.red },
  { name: 'orange', hex: LABEL_COLORS.orange },
  { name: 'yellow', hex: LABEL_COLORS.yellow },
  { name: 'green', hex: LABEL_COLORS.green },
  { name: 'blue', hex: LABEL_COLORS.blue },
  { name: 'purple', hex: LABEL_COLORS.purple },
  { name: 'pink', hex: LABEL_COLORS.pink },
];

// Helper functions for color conversion
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function BoardLabelsSettings({
  boardId,
  labels,
  onLabelsChange,
  disabled = false,
}: BoardLabelsSettingsProps) {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  
  // New label state
  const [newLabelName, setNewLabelName] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>(LABEL_COLORS.blue);
  const [customRgb, setCustomRgb] = useState({ r: 59, g: 130, b: 246 });
  const [customHex, setCustomHex] = useState<string>('#3b82f6');
  
  // Edit label state
  const [editLabelName, setEditLabelName] = useState('');
  const [editSelectedColor, setEditSelectedColor] = useState<string>(LABEL_COLORS.blue);
  const [editCustomRgb, setEditCustomRgb] = useState({ r: 59, g: 130, b: 246 });
  const [editCustomHex, setEditCustomHex] = useState<string>('#3b82f6');

  const handleSelectPresetColor = (hex: string, isEdit = false) => {
    if (isEdit) {
      setEditSelectedColor(hex);
      const rgb = hexToRgb(hex);
      if (rgb) {
        setEditCustomRgb(rgb);
        setEditCustomHex(hex);
      }
    } else {
      setSelectedColor(hex);
      const rgb = hexToRgb(hex);
      if (rgb) {
        setCustomRgb(rgb);
        setCustomHex(hex);
      }
    }
  };

  const handleCustomRgbChange = (channel: 'r' | 'g' | 'b', value: number, isEdit = false) => {
    if (isEdit) {
      const newRgb = { ...editCustomRgb, [channel]: value };
      setEditCustomRgb(newRgb);
      const hex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
      setEditCustomHex(hex);
      setEditSelectedColor(hex);
    } else {
      const newRgb = { ...customRgb, [channel]: value };
      setCustomRgb(newRgb);
      const hex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
      setCustomHex(hex);
      setSelectedColor(hex);
    }
  };

  const handleCustomHexChange = (hex: string, isEdit = false) => {
    if (isEdit) {
      setEditCustomHex(hex);
      const rgb = hexToRgb(hex);
      if (rgb) {
        setEditCustomRgb(rgb);
        setEditSelectedColor(hex);
      }
    } else {
      setCustomHex(hex);
      const rgb = hexToRgb(hex);
      if (rgb) {
        setCustomRgb(rgb);
        setSelectedColor(hex);
      }
    }
  };

  const handleEyedropper = async (isEdit = false) => {
    if ('EyeDropper' in window) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        handleCustomHexChange(result.sRGBHex, isEdit);
      } catch (e) {
        // User cancelled
      }
    }
  };

  const startEditing = (label: BoardLabel) => {
    setEditingLabelId(label.id);
    setEditLabelName(label.name);
    setEditSelectedColor(label.color);
    const rgb = hexToRgb(label.color);
    if (rgb) {
      setEditCustomRgb(rgb);
      setEditCustomHex(label.color);
    }
  };

  const cancelEditing = () => {
    setEditingLabelId(null);
    setEditLabelName('');
  };

  const createLabel = async () => {
    if (!newLabelName.trim()) {
      toast({ title: 'Error', description: 'Label name is required', variant: 'destructive' });
      return;
    }
    
    setSaving(true);
    try {
      const { data, error } = await api.request('/labels', {
        method: 'POST',
        body: JSON.stringify({
          boardId,
          name: newLabelName.trim(),
          color: selectedColor,
        }),
      });

      if (error) throw error;
      
      toast({ title: 'Label created' });
      setNewLabelName('');
      setSelectedColor(LABEL_COLORS.blue);
      setIsAdding(false);
      onLabelsChange();
    } catch (error: any) {
      console.error('Create label error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const updateLabel = async (labelId: string) => {
    if (!editLabelName.trim()) {
      toast({ title: 'Error', description: 'Label name is required', variant: 'destructive' });
      return;
    }
    
    setSaving(true);
    try {
      const { data, error } = await api.request(`/labels/${labelId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editLabelName.trim(),
          color: editSelectedColor,
        }),
      });

      if (error) throw error;
      
      toast({ title: 'Label updated' });
      setEditingLabelId(null);
      onLabelsChange();
    } catch (error: any) {
      console.error('Update label error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteLabel = async (labelId: string) => {
    setDeleting(labelId);
    try {
      // Delete the label (Prisma cascade will handle card_labels deletion)
      const { data, error } = await api.request(`/labels/${labelId}`, {
        method: 'DELETE',
      });

      if (error) throw error;
      
      toast({ title: 'Label deleted' });
      onLabelsChange();
    } catch (error: any) {
      console.error('Delete label error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  const renderColorPicker = (
    selected: string,
    rgb: { r: number; g: number; b: number },
    hex: string,
    isEdit: boolean
  ) => (
    <Tabs defaultValue="presets" className="w-full">
      <TabsList className="grid w-full grid-cols-2 h-8">
        <TabsTrigger value="presets" className="text-xs">Suggested</TabsTrigger>
        <TabsTrigger value="custom" className="text-xs">Custom</TabsTrigger>
      </TabsList>
      <TabsContent value="presets" className="mt-2">
        <div className="grid grid-cols-7 gap-2">
          {PRESET_LABEL_COLORS.map((label) => (
            <button
              key={label.name}
              onClick={() => handleSelectPresetColor(label.hex, isEdit)}
              className={cn(
                "h-8 w-full rounded-md transition-all",
                selected === label.hex 
                  ? "ring-2 ring-offset-2 ring-foreground" 
                  : "hover:ring-2 hover:ring-offset-2 hover:ring-foreground/20"
              )}
              style={{ backgroundColor: label.hex }}
              title={label.name}
            />
          ))}
        </div>
      </TabsContent>
      <TabsContent value="custom" className="mt-2 space-y-3">
        <div className="flex gap-2">
          <div
            className="w-12 h-12 rounded-md border shrink-0"
            style={{ backgroundColor: selected }}
          />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <Input
                value={hex}
                onChange={(e) => handleCustomHexChange(e.target.value, isEdit)}
                className="h-8 text-xs font-mono"
                placeholder="#000000"
                maxLength={7}
              />
              {'EyeDropper' in window && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => handleEyedropper(isEdit)}
                >
                  <Pipette className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium w-4">R</span>
            <Slider
              value={[rgb.r]}
              onValueChange={([v]) => handleCustomRgbChange('r', v, isEdit)}
              max={255}
              step={1}
              className="flex-1"
            />
            <span className="text-xs w-8 text-right">{rgb.r}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium w-4">G</span>
            <Slider
              value={[rgb.g]}
              onValueChange={([v]) => handleCustomRgbChange('g', v, isEdit)}
              max={255}
              step={1}
              className="flex-1"
            />
            <span className="text-xs w-8 text-right">{rgb.g}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium w-4">B</span>
            <Slider
              value={[rgb.b]}
              onValueChange={([v]) => handleCustomRgbChange('b', v, isEdit)}
              max={255}
              step={1}
              className="flex-1"
            />
            <span className="text-xs w-8 text-right">{rgb.b}</span>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium">Board Labels</h3>
          <p className="text-sm text-muted-foreground">
            Create and manage labels that can be applied to cards on this board.
          </p>
        </div>
        {!disabled && !isAdding && (
          <Button size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Label
          </Button>
        )}
      </div>

      {/* Add new label form */}
      {isAdding && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">New Label</Label>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsAdding(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded shrink-0"
                style={{ backgroundColor: selectedColor }}
              />
              <Input
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                placeholder="Label name (required)"
                className="flex-1"
              />
            </div>
            {renderColorPicker(selectedColor, customRgb, customHex, false)}
            <Button 
              onClick={createLabel} 
              disabled={saving || !newLabelName.trim()}
              className="w-full"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Label
            </Button>
          </div>
        </div>
      )}

      {/* Labels list */}
      <div className="space-y-2">
        {labels.length === 0 && !isAdding && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No labels created yet. Add a label to get started.
          </p>
        )}
        
        {labels.map((label) => (
          <div key={label.id} className="border rounded-lg overflow-hidden">
            {editingLabelId === label.id ? (
              <div className="p-4 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Edit Label</Label>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelEditing}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded shrink-0"
                    style={{ backgroundColor: editSelectedColor }}
                  />
                  <Input
                    value={editLabelName}
                    onChange={(e) => setEditLabelName(e.target.value)}
                    placeholder="Label name (required)"
                    className="flex-1"
                  />
                </div>
                {renderColorPicker(editSelectedColor, editCustomRgb, editCustomHex, true)}
                <div className="flex gap-2">
                  <Button 
                    onClick={() => updateLabel(label.id)} 
                    disabled={saving || !editLabelName.trim()}
                    className="flex-1"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                    Save
                  </Button>
                  <Button variant="outline" onClick={cancelEditing}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded shrink-0"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="font-medium">{label.name}</span>
                </div>
                {!disabled && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => startEditing(label)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteLabel(label.id)}
                      disabled={deleting === label.id}
                    >
                      {deleting === label.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
