import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useMantineColorScheme } from '@mantine/core';
import { themes, type ThemeColors } from '../config/themes.js';

type Theme = 'light' | 'dark' | 'auto';

interface ThemeContextType {
  theme: Theme;
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  themeColors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { setColorScheme } = useMantineColorScheme();

  /** App default is light; `setTheme` remains for a future global toggle (not profile). */
  const [theme, setThemeState] = useState<Theme>('light');

  // Calculate effective theme (light or dark)
  const getEffectiveTheme = (currentTheme: Theme): 'light' | 'dark' => {
    if (currentTheme === 'auto') {
      // Check system preference
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
      return 'light';
    }
    return currentTheme;
  };

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(getEffectiveTheme(theme));

  const applyEffectiveToDocument = useCallback(
    (effective: 'light' | 'dark'): void => {
      setEffectiveTheme(effective);
      setColorScheme(effective);
      const root = document.documentElement;
      root.setAttribute('data-theme', effective);
      root.classList.remove('light', 'dark');
      root.classList.add(effective);
    },
    [setColorScheme],
  );

  // Apply theme to document
  useEffect(() => {
    applyEffectiveToDocument(getEffectiveTheme(theme));
  }, [theme, applyEffectiveToDocument]);

  // Listen for system theme changes when theme is 'auto'
  useEffect(() => {
    if (theme !== 'auto') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      applyEffectiveToDocument(getEffectiveTheme(theme));
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }
    // Legacy browsers
    if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => {
        mediaQuery.removeListener(handleChange);
      };
    }

    return undefined;
  }, [theme, applyEffectiveToDocument]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const themeColors = themes[effectiveTheme];

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme, themeColors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

