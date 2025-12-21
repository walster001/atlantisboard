import { cn } from '@/lib/utils';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold: number;
}

/**
 * Visual indicator for pull-to-refresh action.
 * Shows a spinner that rotates based on pull distance and spins during refresh.
 */
export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold,
}: PullToRefreshIndicatorProps) {
  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 360;
  const scale = 0.5 + progress * 0.5;
  const opacity = Math.min(progress * 1.5, 1);

  if (pullDistance <= 0 && !isRefreshing) return null;

  return (
    <div 
      className="absolute left-1/2 -translate-x-1/2 z-50 pointer-events-none"
      style={{ 
        top: Math.max(8, pullDistance - 40),
        opacity,
        transform: `translateX(-50%) scale(${scale})`,
        transition: isRefreshing ? 'none' : 'transform 0.1s ease-out',
      }}
    >
      <div 
        className={cn(
          "w-10 h-10 rounded-full bg-background shadow-lg flex items-center justify-center border",
          progress >= 1 && !isRefreshing && "ring-2 ring-primary ring-offset-2"
        )}
      >
        <RefreshCw 
          className={cn(
            "h-5 w-5 text-primary transition-colors",
            isRefreshing && "animate-spin"
          )}
          style={{ 
            transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
          }}
        />
      </div>
    </div>
  );
}
