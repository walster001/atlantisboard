import * as React from "react";
import { useCallback, useRef, useState } from "react";
import { Sheet, SheetContent } from "./sheet";
import { cn } from "@/lib/utils";

interface SwipeableSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  swipeThreshold?: number; // Distance in px to trigger dismiss
}

/**
 * A Sheet component that can be dismissed by swiping down on mobile.
 * Shows a drag handle indicator and provides visual feedback during swipe.
 */
export function SwipeableSheet({
  open,
  onOpenChange,
  children,
  className,
  swipeThreshold = 100,
}: SwipeableSheetProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only start drag if touching the handle area (top 60px) or if scrolled to top
    const touch = e.touches[0];
    const target = e.target as HTMLElement;
    const scrollContainer = contentRef.current?.querySelector('[data-swipeable-content]');
    
    // Check if we're in the drag handle area
    const handleArea = target.closest('[data-drag-handle]');
    const isAtScrollTop = !scrollContainer || (scrollContainer as HTMLElement).scrollTop === 0;
    
    // Allow drag if clicking handle or if content is at scroll top
    if (handleArea || isAtScrollTop) {
      startYRef.current = touch.clientY;
      currentYRef.current = touch.clientY;
      setIsDragging(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const touch = e.touches[0];
    currentYRef.current = touch.clientY;
    const diff = currentYRef.current - startYRef.current;
    
    // Only allow dragging down (positive diff)
    if (diff > 0) {
      // Apply resistance as user drags further
      const resistance = 0.5;
      const resistedDiff = diff * resistance;
      setDragOffset(resistedDiff);
      
      // Prevent scrolling while swiping
      e.preventDefault();
    }
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    
    setIsDragging(false);
    
    // Check if swipe exceeded threshold
    if (dragOffset > swipeThreshold) {
      onOpenChange(false);
    }
    
    // Reset offset with animation
    setDragOffset(0);
  }, [isDragging, dragOffset, swipeThreshold, onOpenChange]);

  // Calculate opacity based on drag offset
  const overlayOpacity = Math.max(0, 1 - dragOffset / (swipeThreshold * 2));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "h-[90vh] p-0 rounded-t-2xl transition-transform touch-none",
          !isDragging && "duration-300",
          className
        )}
        style={{
          transform: `translateY(${dragOffset}px)`,
          // @ts-ignore -- custom property for overlay
          '--sheet-overlay-opacity': overlayOpacity,
        }}
        hideCloseButton
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div ref={contentRef} className="flex flex-col h-full">
          {/* Drag Handle */}
          <div 
            data-drag-handle
            className="flex justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
          >
            <div 
              className={cn(
                "w-10 h-1 rounded-full bg-muted-foreground/30 transition-all",
                isDragging && "w-14 bg-muted-foreground/50"
              )}
            />
          </div>
          
          {/* Content wrapper */}
          <div data-swipeable-content className="flex-1 min-h-0 overflow-y-auto">
            {children}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
