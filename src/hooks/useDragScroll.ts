import { useRef, useEffect, useCallback, useState } from 'react';

export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });
  const scrollPos = useRef({ left: 0, top: 0 });

  const isInteractiveElement = (target: HTMLElement): boolean => {
    // Check if clicked on an interactive element or draggable card/column
    const interactiveSelectors = [
      'button', 'input', 'textarea', 'select', 'a',
      '[data-rbd-draggable-id]', // hello-pangea draggable
      '[data-rbd-drag-handle-draggable-id]', // drag handles
      '.bg-column', // column cards area
      '[role="button"]',
    ];
    
    return interactiveSelectors.some(selector => 
      target.closest(selector) !== null
    );
  };

  const handleMouseDown = useCallback((e: MouseEvent) => {
    const element = ref.current;
    if (!element) return;
    
    const target = e.target as HTMLElement;
    
    // Don't start drag scroll if clicking on interactive elements
    if (isInteractiveElement(target)) return;
    
    // Only left mouse button
    if (e.button !== 0) return;

    setIsDragging(true);
    startPos.current = { x: e.clientX, y: e.clientY };
    scrollPos.current = { left: element.scrollLeft, top: element.scrollTop };
    
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const element = ref.current;
    if (!element) return;

    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    
    element.scrollLeft = scrollPos.current.left - dx;
    element.scrollTop = scrollPos.current.top - dy;
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp]);

  return { ref, isDragging };
}
