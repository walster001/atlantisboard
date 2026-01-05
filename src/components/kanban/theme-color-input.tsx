import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Pipette, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RGB_MIN, RGB_MAX, HEX_BASE } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Helper functions to convert between color formats
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], HEX_BASE),
        g: parseInt(result[2], HEX_BASE),
        b: parseInt(result[3], HEX_BASE),
      }
    : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(RGB_MIN, Math.min(RGB_MAX, Math.round(x))).toString(HEX_BASE);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// Calculate relative luminance for WCAG contrast calculations
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Calculate contrast ratio between two colors
function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  if (!rgb1 || !rgb2) return 0;
  
  const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

// Get accessibility warning and suggestion
export function getAccessibilityInfo(foreground: string, background: string): {
  ratio: number;
  level: 'AAA' | 'AA' | 'fail';
  message: string;
  suggestion?: string;
} {
  const ratio = getContrastRatio(foreground, background);
  
  if (ratio >= 7) {
    return { ratio, level: 'AAA', message: 'Excellent contrast (AAA)' };
  } else if (ratio >= 4.5) {
    return { ratio, level: 'AA', message: 'Good contrast (AA)' };
  } else {
    const fgRgb = hexToRgb(foreground);
    const bgRgb = hexToRgb(background);
    let suggestion = 'Try a darker text color or lighter background.';
    
    if (fgRgb && bgRgb) {
      const fgLum = getLuminance(fgRgb.r, fgRgb.g, fgRgb.b);
      const bgLum = getLuminance(bgRgb.r, bgRgb.g, bgRgb.b);
      
      if (fgLum > bgLum) {
        suggestion = 'Try using a lighter text color (e.g., #ffffff) or darken the background.';
      } else {
        suggestion = 'Try using a darker text color (e.g., #000000) or lighten the background.';
      }
    }
    
    return { 
      ratio, 
      level: 'fail', 
      message: `Poor contrast (${ratio.toFixed(1)}:1)`,
      suggestion
    };
  }
}

interface ThemeColorInputProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  contrastAgainst?: string;
  allowNull?: boolean;
  nullLabel?: string;
}

export function ThemeColorInput({ 
  label, 
  value, 
  onChange, 
  contrastAgainst,
  allowNull = false,
  nullLabel = 'None'
}: ThemeColorInputProps) {
  const [open, setOpen] = useState(false);
  const [rgb, setRgb] = useState({ r: 0, g: 0, b: 0 });
  const [hexInput, setHexInput] = useState(value || '#000000');
  const { toast } = useToast();

  // Sync RGB values when value changes
  useEffect(() => {
    if (value) {
      const parsed = hexToRgb(value);
      if (parsed) {
        setRgb(parsed);
        setHexInput(value);
      }
    }
  }, [value]);

  const handleRgbChange = (channel: 'r' | 'g' | 'b', inputValue: string) => {
    const numValue = Math.max(0, Math.min(255, parseInt(inputValue) || 0));
    const newRgb = { ...rgb, [channel]: numValue };
    setRgb(newRgb);
    const hex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
    onChange(hex);
    setHexInput(hex);
  };

  const handleHexChange = (inputValue: string) => {
    setHexInput(inputValue);
    if (/^#[0-9A-Fa-f]{6}$/.test(inputValue)) {
      onChange(inputValue);
      const parsed = hexToRgb(inputValue);
      if (parsed) {
        setRgb(parsed);
      }
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
      const eyeDropper = new window.EyeDropper!();
      const result = await eyeDropper.open();
      const color = result.sRGBHex;
      onChange(color);
      setHexInput(color);
      const parsed = hexToRgb(color);
      if (parsed) {
        setRgb(parsed);
      }
    } catch (e) {
      console.log('EyeDropper cancelled');
    }
  };

  const accessibilityInfo = contrastAgainst && value
    ? getAccessibilityInfo(value, contrastAgainst)
    : null;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Label className="text-sm font-medium shrink-0">{label}</Label>
        {accessibilityInfo && accessibilityInfo.level === 'fail' && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-medium">{accessibilityInfo.message}</p>
                {accessibilityInfo.suggestion && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {accessibilityInfo.suggestion}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="flex items-center gap-2 p-1.5 rounded-md border border-border hover:bg-muted transition-colors"
          >
            <div
              className={cn(
                "h-6 w-6 rounded border border-border shrink-0",
                !value && "bg-[repeating-linear-gradient(45deg,#ccc,#ccc_2px,transparent_2px,transparent_8px)]"
              )}
              style={{ backgroundColor: value || undefined }}
            />
            <span className="text-xs font-mono text-muted-foreground w-16">
              {value || nullLabel}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3 z-[9999]" align="end">
          <div className="space-y-3">
            {/* Color preview */}
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "h-10 w-10 rounded-lg border-2 border-border shrink-0",
                  !value && "bg-[repeating-linear-gradient(45deg,#ccc,#ccc_2px,transparent_2px,transparent_8px)]"
                )}
                style={{ backgroundColor: value || undefined }}
              />
              <div className="flex-1 flex gap-2">
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

            {/* RGB sliders */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="w-4 text-xs text-red-500 font-medium">R</Label>
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
                  className="w-12 h-6 text-xs text-center p-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="w-4 text-xs text-green-500 font-medium">G</Label>
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
                  className="w-12 h-6 text-xs text-center p-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="w-4 text-xs text-blue-500 font-medium">B</Label>
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
                  className="w-12 h-6 text-xs text-center p-1"
                />
              </div>
            </div>

            {allowNull && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Clear ({nullLabel})
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
