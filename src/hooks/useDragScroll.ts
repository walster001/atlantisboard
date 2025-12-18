import { useRef, useEffect, useCallback, useState } from 'react';

export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const dragState = useRef({
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
    isDown: false,
  });

  const startDrag = useCallback((e: MouseEvent) => {
    const element = ref.current;
    if (!element) return;
    
    dragState.current = {
      isDown: true,
      startX: e.pageX,
      startY: e.pageY,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
    };
    setIsDragging(true);
    e.preventDefault();
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    const element = ref.current;
    if (!element) return;

    const target = e.target as HTMLElement;
    
    // Middle mouse button always enables drag scroll
    if (e.button === 1) {
      startDrag(e);
      return;
    }
    
    // If spacebar is held, enable drag scroll with left click anywhere
    if (isSpaceHeld && e.button === 0) {
      startDrag(e);
      return;
    }
    
    // Left click - only on empty areas (not on cards, columns, buttons, etc.)
    if (e.button !== 0) return;
    
    const isScrollContainer = target === element;
    const isDragScrollArea = target.classList.contains('drag-scroll-area');
    
    if (!isScrollContainer && !isDragScrollArea) return;

    startDrag(e);
  }, [isSpaceHeld, startDrag]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.current.isDown) return;
    const element = ref.current;
    if (!element) return;

    e.preventDefault();
    const walkX = e.pageX - dragState.current.startX;
    const walkY = e.pageY - dragState.current.startY;
    
    element.scrollLeft = dragState.current.scrollLeft - walkX;
    element.scrollTop = dragState.current.scrollTop - walkY;
  }, []);

  const handleMouseUp = useCallback(() => {
    dragState.current.isDown = false;
    setIsDragging(false);
  }, []);

  // Horizontal scroll with Shift+Wheel
  const handleWheel = useCallback((e: WheelEvent) => {
    const element = ref.current;
    if (!element) return;

    if (e.shiftKey) {
      e.preventDefault();
      element.scrollLeft += e.deltaY;
    }
  }, []);

  // Track spacebar state
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space' && !e.repeat) {
      // Only set space held if not focusing an input
      const target = e.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        setIsSpaceHeld(true);
      }
    }
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space') {
      setIsSpaceHeld(false);
      // Also stop dragging when space is released
      if (dragState.current.isDown) {
        dragState.current.isDown = false;
        setIsDragging(false);
      }
    }
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    element.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      element.removeEventListener('wheel', handleWheel);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, handleKeyDown, handleKeyUp]);

  return { ref, isDragging, isSpaceHeld };
}
