import { useState, useEffect } from 'react';
import { Card, Label, LABEL_COLORS, LabelColorName, getLabelHexColor } from '@/types/kanban';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label as UILabel } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Calendar as CalendarIcon, X, Tag, Pipette } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { HEX_BASE, DEFAULT_BLUE_RGB, DEFAULT_BLUE_HEX } from '@/lib/constants';
import '@/types/browser'; // Import browser API types

// Helper functions for color conversion
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], HEX_BASE),
    g: parseInt(result[2], HEX_BASE),
    b: parseInt(result[3], HEX_BASE)
  } : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
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

interface CardEditDialogProps {
  card: Card | null;
  open: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Card>) => void;
  onAddLabel: (label: Label) => void;
  onRemoveLabel: (labelId: string) => void;
  disabled?: boolean;
}

export function CardEditDialog({
  card,
  open,
  onClose,
  onSave,
  onAddLabel,
  onRemoveLabel,
  disabled = false,
}: CardEditDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [newLabelText, setNewLabelText] = useState('');
  const [selectedLabelColor, setSelectedLabelColor] = useState<string>(LABEL_COLORS.blue);
  const [customRgb, setCustomRgb] = useState({ r: 59, g: 130, b: 246 });
  const [customHex, setCustomHex] = useState<string>('#3b82f6');

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description || '');
      setDueDate(card.dueDate ? new Date(card.dueDate) : undefined);
    }
  }, [card]);

  const handleSave = () => {
    onSave({
      title,
      description: description || undefined,
      dueDate: dueDate?.toISOString(),
    });
    onClose();
  };

  const handleAddLabel = (color: string) => {
    const newLabel: Label = {
      id: Math.random().toString(36).substr(2, 9),
      color,
      text: newLabelText || undefined,
    };
    onAddLabel(newLabel);
    setNewLabelText('');
    setShowLabelPicker(false);
  };

  const handleCustomRgbChange = (channel: 'r' | 'g' | 'b', value: number) => {
    const newRgb = { ...customRgb, [channel]: value };
    setCustomRgb(newRgb);
    const hex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
    setCustomHex(hex);
    setSelectedLabelColor(hex);
  };

  const handleCustomHexChange = (hex: string) => {
    setCustomHex(hex);
    const rgb = hexToRgb(hex);
    if (rgb) {
      setCustomRgb(rgb);
      setSelectedLabelColor(hex);
    }
  };

  const handleEyedropper = async () => {
    if ('EyeDropper' in window) {
      try {
        const eyeDropper = new window.EyeDropper!();
        const result = await eyeDropper.open();
        handleCustomHexChange(result.sRGBHex);
      } catch (e) {
        // User cancelled
      }
    }
  };

  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{disabled ? 'View Card' : 'Edit Card'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <UILabel htmlFor="title">Title</UILabel>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Card title"
              readOnly={disabled}
              className={disabled ? 'cursor-default bg-muted' : ''}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <UILabel htmlFor="description">Description</UILabel>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={disabled ? 'No description' : 'Add a more detailed description...'}
              rows={4}
              readOnly={disabled}
              className={disabled ? 'cursor-default bg-muted' : ''}
            />
          </div>

          {/* Labels */}
          <div className="space-y-2">
            <UILabel>Labels</UILabel>
            <div className="flex flex-wrap gap-2">
              {card.labels.map((label) => (
                <span
                  key={label.id}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: getLabelHexColor(label.color) }}
                >
                  {label.text || label.color}
                  {!disabled && (
                    <button
                      onClick={() => onRemoveLabel(label.id)}
                      className="hover:bg-white/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
              {!disabled && (
                <Popover open={showLabelPicker} onOpenChange={setShowLabelPicker}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7">
                      <Tag className="h-3 w-3 mr-1" />
                      Add Label
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="start">
                    <div className="space-y-3">
                      <Input
                        value={newLabelText}
                        onChange={(e) => setNewLabelText(e.target.value)}
                        placeholder="Label text (optional)"
                        className="h-8"
                      />
                      <Tabs defaultValue="presets" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 h-8">
                          <TabsTrigger value="presets" className="text-xs">Presets</TabsTrigger>
                          <TabsTrigger value="custom" className="text-xs">Custom</TabsTrigger>
                        </TabsList>
                        <TabsContent value="presets" className="mt-2">
                          <div className="grid grid-cols-7 gap-1">
                            {PRESET_LABEL_COLORS.map((label) => (
                              <button
                                key={label.name}
                                onClick={() => handleAddLabel(label.hex)}
                                className="h-6 w-full rounded hover:ring-2 hover:ring-offset-1 hover:ring-foreground/20 transition-all"
                                style={{ backgroundColor: label.hex }}
                                title={label.name}
                              />
                            ))}
                          </div>
                        </TabsContent>
                        <TabsContent value="custom" className="mt-2 space-y-3">
                          <div className="flex gap-2">
                            <div
                              className="w-10 h-10 rounded-md border shrink-0"
                              style={{ backgroundColor: selectedLabelColor }}
                            />
                            <div className="flex-1 flex gap-2">
                              <Input
                                value={customHex}
                                onChange={(e) => handleCustomHexChange(e.target.value)}
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
                                  onClick={handleEyedropper}
                                >
                                  <Pipette className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs w-3">R</span>
                              <Slider value={[customRgb.r]} onValueChange={([v]) => handleCustomRgbChange('r', v)} max={255} step={1} className="flex-1" />
                              <span className="text-xs w-6 text-right">{customRgb.r}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs w-3">G</span>
                              <Slider value={[customRgb.g]} onValueChange={([v]) => handleCustomRgbChange('g', v)} max={255} step={1} className="flex-1" />
                              <span className="text-xs w-6 text-right">{customRgb.g}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs w-3">B</span>
                              <Slider value={[customRgb.b]} onValueChange={([v]) => handleCustomRgbChange('b', v)} max={255} step={1} className="flex-1" />
                              <span className="text-xs w-6 text-right">{customRgb.b}</span>
                            </div>
                          </div>
                          <Button size="sm" className="w-full" onClick={() => handleAddLabel(selectedLabelColor)}>
                            Add Custom Label
                          </Button>
                        </TabsContent>
                      </Tabs>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <UILabel>Due Date</UILabel>
            <div className="flex items-center gap-2">
              {disabled ? (
                <div className={cn(
                  'flex items-center px-3 py-2 text-sm border rounded-md bg-muted',
                  !dueDate && 'text-muted-foreground'
                )}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dueDate ? format(dueDate, 'PPP') : 'No due date'}
                </div>
              ) : (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'justify-start text-left font-normal',
                          !dueDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dueDate ? format(dueDate, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dueDate}
                        onSelect={setDueDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {dueDate && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDueDate(undefined)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {disabled ? 'Close' : 'Cancel'}
          </Button>
          {!disabled && <Button onClick={handleSave}>Save Changes</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
