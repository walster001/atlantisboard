/**
 * Toggle Slider Component
 * A custom toggle with support for tri-state (on/partial/off)
 */

import { cn } from '@/lib/utils';

interface ToggleSliderProps {
  state: 'on' | 'partial' | 'off';
  disabled?: boolean;
  onChange?: () => void;
  className?: string;
}

export function ToggleSlider({ state, disabled = false, onChange, className }: ToggleSliderProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={state === 'on'}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0",
        state === 'on' && "bg-primary",
        state === 'partial' && "bg-gradient-to-r from-muted-foreground/30 via-muted-foreground/30 to-primary",
        state === 'off' && "bg-muted-foreground/30",
        disabled && "opacity-60 cursor-not-allowed",
        !disabled && "cursor-pointer hover:ring-2 hover:ring-ring/30 active:scale-95",
        className
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 w-5 h-5 bg-card rounded-full shadow-md transition-transform duration-200",
          state === 'on' && "translate-x-5",
          state === 'partial' && "translate-x-2.5"
        )}
      />
    </button>
  );
}
