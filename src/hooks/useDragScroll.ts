import { useRef, useEffect, useCallback } from 'react';

export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const scrollLeft = useRef(0);
  const scrollTop = useRef(0);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    const element = ref.current;
    if (!element) return;
    
    // Only start drag scroll on middle mouse button or when clicking on the background
    // Avoid interfering with drag-and-drop of cards/columns
    const target = e.target as HTMLElement;
    const isBackground = target === element || target.classList.contains('drag-scroll-area');
    
    if (e.button === 1 || (e.button === 0 && isBackground)) {
      isDragging.current = true;
      startX.current = e.pageX - element.offsetLeft;
      startY.current = e.pageY - element.offsetTop;
      scrollLeft.current = element.scrollLeft;
      scrollTop.current = element.scrollTop;
      element.style.cursor = 'grabbing';
      element.style.userSelect = 'none';
      e.preventDefault();
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const element = ref.current;
    if (!element) return;

    e.preventDefault();
    const x = e.pageX - element.offsetLeft;
    const y = e.pageY - element.offsetTop;
    const walkX = (x - startX.current) * 1.5; // Scroll speed multiplier
    const walkY = (y - startY.current) * 1.5;
    element.scrollLeft = scrollLeft.current - walkX;
    element.scrollTop = scrollTop.current - walkY;
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    const element = ref.current;
    if (element) {
      element.style.cursor = '';
      element.style.userSelect = '';
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false;
      const element = ref.current;
      if (element) {
        element.style.cursor = '';
        element.style.userSelect = '';
      }
    }
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseup', handleMouseUp);
    element.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseup', handleMouseUp);
      element.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleMouseLeave]);

  return ref;
}
