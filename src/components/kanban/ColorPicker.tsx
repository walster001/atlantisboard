import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { Palette, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface ColorPickerProps {
  currentColor: string | null;
  onApply: (color: string | null) => void;
  onApplyToAll: (color: string | null) => void;
  applyToAllLabel: string;
  trigger?: React.ReactNode;
}

export function ColorPicker({ 
  currentColor, 
  onApply, 
  onApplyToAll, 
  applyToAllLabel,
  trigger 
}: ColorPickerProps) {
  const [selectedColor, setSelectedColor] = useState<string | null>(currentColor);
  const [open, setOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const handleApply = () => {
    onApply(selectedColor === '#ffffff' ? null : selectedColor);
    setOpen(false);
  };

  const handleApplyToAllClick = () => {
    setConfirmDialogOpen(true);
  };

  const handleConfirmApplyToAll = () => {
    onApplyToAll(selectedColor === '#ffffff' ? null : selectedColor);
    setConfirmDialogOpen(false);
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {trigger || (
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <Palette className="h-4 w-4 mr-2" />
              Card Colour
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="start" side="bottom">
          <div className="space-y-3">
            <p className="text-sm font-medium">Select Colour</p>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
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
            <div className="flex flex-col gap-2 pt-2 border-t">
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
