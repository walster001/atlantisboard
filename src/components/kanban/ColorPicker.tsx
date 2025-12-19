import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Palette, Check, Pipette, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const RECENT_COLORS_KEY = 'kanban-recent-colors';
const MAX_RECENT_COLORS = 5;

const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#6b7280', // gray
  '#ffffff', // white (no color)
];

// Helper functions to convert between color formats
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function getRecentColors(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_COLORS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentColor(color: string): string[] {
  if (!color || color === '#ffffff') return getRecentColors();
  
  const recent = getRecentColors().filter(c => c.toLowerCase() !== color.toLowerCase());
  const updated = [color, ...recent].slice(0, MAX_RECENT_COLORS);
  
  try {
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(updated));
  } catch {
    // localStorage might be full or unavailable
  }
  
  return updated;
}

interface ColorPickerProps {
  currentColor: string | null;
  onApply: (color: string | null) => void;
  onApplyToAll: (color: string | null) => void;
  applyToAllLabel: string;
  trigger?: React.ReactNode;
  onClose?: () => void;
}

export function ColorPicker({ 
  currentColor, 
  onApply, 
  onApplyToAll, 
  applyToAllLabel,
  trigger,
  onClose 
}: ColorPickerProps) {
  const [selectedColor, setSelectedColor] = useState<string | null>(currentColor);
  const [open, setOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [rgb, setRgb] = useState({ r: 0, g: 0, b: 0 });
  const [hexInput, setHexInput] = useState(currentColor || '#000000');
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const { toast } = useToast();

  // Load recent colors on mount
  useEffect(() => {
    setRecentColors(getRecentColors());
  }, []);

  // Sync RGB values when selectedColor changes
  useEffect(() => {
    if (selectedColor && selectedColor !== '#ffffff') {
      const { r, g, b } = hexToRgb(selectedColor);
      setRgb({ r, g, b });
      setHexInput(selectedColor);
    }
  }, [selectedColor]);

  const handleRgbChange = (channel: 'r' | 'g' | 'b', value: string) => {
    const numValue = Math.max(0, Math.min(255, parseInt(value) || 0));
    const newRgb = { ...rgb, [channel]: numValue };
    setRgb(newRgb);
    const hex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
    setSelectedColor(hex);
    setHexInput(hex);
  };

  const handleHexChange = (value: string) => {
    setHexInput(value);
    // Only update if it's a valid hex color
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      setSelectedColor(value);
      const { r, g, b } = hexToRgb(value);
      setRgb({ r, g, b });
    }
  };

  const handleEyedropper = async () => {
    if (!('EyeDropper' in window)) {
      toast({
        title: 'Not supported',
        description: 'Your browser does not support the EyeDropper tool',
        variant: 'destructive',
      });
      return;
    }

    try {
      // @ts-ignore - EyeDropper API
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      const color = result.sRGBHex;
      setSelectedColor(color);
      setHexInput(color);
      const { r, g, b } = hexToRgb(color);
      setRgb({ r, g, b });
    } catch (e) {
      // User cancelled or error occurred
      console.log('EyeDropper cancelled');
    }
  };

  const handleApply = () => {
    const colorToApply = selectedColor === '#ffffff' ? null : selectedColor;
    if (selectedColor && selectedColor !== '#ffffff') {
      setRecentColors(addRecentColor(selectedColor));
    }
    onApply(colorToApply);
    setOpen(false);
    onClose?.();
  };

  const handleApplyToAllClick = () => {
    setConfirmDialogOpen(true);
  };

  const handleConfirmApplyToAll = () => {
    const colorToApply = selectedColor === '#ffffff' ? null : selectedColor;
    if (selectedColor && selectedColor !== '#ffffff') {
      setRecentColors(addRecentColor(selectedColor));
    }
    onApplyToAll(colorToApply);
    setConfirmDialogOpen(false);
    setOpen(false);
    onClose?.();
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          {trigger || (
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <Palette className="h-4 w-4 mr-2" />
              Card Colour
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent 
          className="w-72 p-0 z-[9999]" 
          align="start" 
          side="bottom"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <div 
            className="p-3"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
          <Tabs defaultValue="presets" className="w-full">
            <TabsList className="w-full grid grid-cols-2 mb-3">
              <TabsTrigger value="presets">Presets</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
            
            <TabsContent value="presets" className="space-y-3">
              <div className="grid grid-cols-5 gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      setSelectedColor(color);
                      setHexInput(color);
                      if (color !== '#ffffff') {
                        const { r, g, b } = hexToRgb(color);
                        setRgb({ r, g, b });
                      }
                    }}
                    className={cn(
                      'h-8 w-8 rounded-md border-2 transition-all hover:scale-110',
                      selectedColor === color ? 'border-primary ring-2 ring-primary/20' : 'border-transparent',
                      color === '#ffffff' && 'border-border'
                    )}
                    style={{ backgroundColor: color }}
                  >
                    {selectedColor === color && (
                      <Check className={cn('h-4 w-4 mx-auto', color === '#ffffff' ? 'text-foreground' : 'text-white')} />
                    )}
                  </button>
                ))}
              </div>
              
              {/* Recent colors */}
              {recentColors.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Recent</span>
                  </div>
                  <div className="flex gap-2">
                    {recentColors.map((color, index) => (
                      <button
                        key={`${color}-${index}`}
                        onClick={() => {
                          setSelectedColor(color);
                          setHexInput(color);
                          const { r, g, b } = hexToRgb(color);
                          setRgb({ r, g, b });
                        }}
                        className={cn(
                          'h-8 w-8 rounded-md border-2 transition-all hover:scale-110',
                          selectedColor === color ? 'border-primary ring-2 ring-primary/20' : 'border-transparent'
                        )}
                        style={{ backgroundColor: color }}
                      >
                        {selectedColor === color && (
                          <Check className="h-4 w-4 mx-auto text-white" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="custom" className="space-y-3">
              {/* Color preview */}
              <div className="flex items-center gap-3">
                <div
                  className="h-12 w-12 rounded-lg border-2 border-border shrink-0"
                  style={{ backgroundColor: selectedColor || '#ffffff' }}
                />
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={hexInput}
                      onChange={(e) => handleHexChange(e.target.value)}
                      placeholder="#000000"
                      className="h-8 text-xs font-mono"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={handleEyedropper}
                      title="Pick colour from screen"
                    >
                      <Pipette className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* RGB sliders */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="w-6 text-xs text-red-500 font-medium">R</Label>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={rgb.r}
                    onChange={(e) => handleRgbChange('r', e.target.value)}
                    className="flex-1 h-2 appearance-none bg-gradient-to-r from-black via-red-500 to-red-500 rounded-lg cursor-pointer"
                  />
                  <Input
                    type="number"
                    min="0"
                    max="255"
                    value={rgb.r}
                    onChange={(e) => handleRgbChange('r', e.target.value)}
                    className="w-14 h-7 text-xs text-center"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="w-6 text-xs text-green-500 font-medium">G</Label>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={rgb.g}
                    onChange={(e) => handleRgbChange('g', e.target.value)}
                    className="flex-1 h-2 appearance-none bg-gradient-to-r from-black via-green-500 to-green-500 rounded-lg cursor-pointer"
                  />
                  <Input
                    type="number"
                    min="0"
                    max="255"
                    value={rgb.g}
                    onChange={(e) => handleRgbChange('g', e.target.value)}
                    className="w-14 h-7 text-xs text-center"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="w-6 text-xs text-blue-500 font-medium">B</Label>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={rgb.b}
                    onChange={(e) => handleRgbChange('b', e.target.value)}
                    className="flex-1 h-2 appearance-none bg-gradient-to-r from-black via-blue-500 to-blue-500 rounded-lg cursor-pointer"
                  />
                  <Input
                    type="number"
                    min="0"
                    max="255"
                    value={rgb.b}
                    onChange={(e) => handleRgbChange('b', e.target.value)}
                    className="w-14 h-7 text-xs text-center"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex flex-col gap-2 pt-3 border-t mt-3">
            <Button size="sm" onClick={handleApply}>
              Apply
            </Button>
            <Button size="sm" variant="outline" onClick={handleApplyToAllClick}>
              {applyToAllLabel}
            </Button>
          </div>
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will apply the selected colour to all items. This action cannot be easily undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmApplyToAll}>
              Apply to All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
