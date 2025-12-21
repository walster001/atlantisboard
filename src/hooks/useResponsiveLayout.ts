import { useState, useEffect } from 'react';

export type LayoutMode = 'mobile' | 'tablet' | 'desktop';

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

export function useResponsiveLayout() {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('desktop');
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    const updateLayout = () => {
      const width = window.innerWidth;
      setWindowWidth(width);
      
      if (width < MOBILE_BREAKPOINT) {
        setLayoutMode('mobile');
      } else if (width < TABLET_BREAKPOINT) {
        setLayoutMode('tablet');
      } else {
        setLayoutMode('desktop');
      }
    };

    updateLayout();
    
    const mqlMobile = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const mqlTablet = window.matchMedia(`(max-width: ${TABLET_BREAKPOINT - 1}px)`);
    
    const handleChange = () => updateLayout();
    
    mqlMobile.addEventListener('change', handleChange);
    mqlTablet.addEventListener('change', handleChange);
    window.addEventListener('resize', handleChange);

    return () => {
      mqlMobile.removeEventListener('change', handleChange);
      mqlTablet.removeEventListener('change', handleChange);
      window.removeEventListener('resize', handleChange);
    };
  }, []);

  return {
    layoutMode,
    isMobile: layoutMode === 'mobile',
    isTablet: layoutMode === 'tablet',
    isDesktop: layoutMode === 'desktop',
    windowWidth,
  };
}
