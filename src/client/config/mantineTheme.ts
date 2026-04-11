import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Custom color tuples for Mantine
const blue: MantineColorsTuple = [
  '#eff6ff',
  '#dbeafe',
  '#bfdbfe',
  '#93c5fd',
  '#60a5fa',
  '#3b82f6', // primary-500
  '#2563eb', // primary-600
  '#1d4ed8',
  '#1e40af',
  '#1e3a8a',
];

const sky: MantineColorsTuple = [
  '#f0f9ff',
  '#e0f2fe',
  '#bae6fd',
  '#7dd3fc',
  '#38bdf8',
  '#0ea5e9', // accent-500
  '#0284c7', // accent-600
  '#0369a1',
  '#075985',
  '#0c4a6e',
];

const emerald: MantineColorsTuple = [
  '#ecfdf5',
  '#d1fae5',
  '#a7f3d0',
  '#6ee7b7',
  '#34d399',
  '#10b981', // success-500
  '#059669',
  '#047857',
  '#065f46',
  '#064e3b',
];

const amber: MantineColorsTuple = [
  '#fffbeb',
  '#fef3c7',
  '#fde68a',
  '#fcd34d',
  '#fbbf24',
  '#f59e0b', // warning-500
  '#d97706',
  '#b45309',
  '#92400e',
  '#78350f',
];

const red: MantineColorsTuple = [
  '#fef2f2',
  '#fee2e2',
  '#fecaca',
  '#fca5a5',
  '#f87171',
  '#ef4444', // error-500
  '#dc2626',
  '#b91c1c',
  '#991b1b',
  '#7f1d1d',
];

export const mantineTheme = createTheme({
  primaryColor: 'blue',
  primaryShade: 5,
  
  colors: {
    blue,
    sky,
    emerald,
    amber,
    red,
  },

  fontFamily: 'var(--kb-app-ui-font-family)',
  headings: {
    fontFamily: 'var(--kb-app-ui-font-family)',
    fontWeight: '600',
  },

  defaultRadius: 'md', // 0.5rem / 8px (matches --rounded-box)

  radius: {
    xs: '0.25rem',   // 4px
    sm: '0.375rem',  // 6px (matches --rounded-btn)
    md: '0.5rem',    // 8px (matches --rounded-box)
    lg: '0.75rem',   // 12px
    xl: '1rem',      // 16px
  },

  shadows: {
    xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    sm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  },

  defaultGradient: {
    from: 'blue',
    to: 'sky',
    deg: 45,
  },

  components: {
    Button: {
      defaultProps: {
        radius: 'sm', // 6px (matches --rounded-btn)
      },
    },
    TextInput: {
      defaultProps: {
        radius: 'md',
      },
    },
    Textarea: {
      defaultProps: {
        radius: 'md',
      },
    },
    Select: {
      defaultProps: {
        radius: 'md',
      },
    },
    Card: {
      defaultProps: {
        radius: 'md', // 8px (matches --rounded-box)
        withBorder: true,
      },
    },
    Modal: {
      defaultProps: {
        radius: 'md',
      },
    },
    Alert: {
      defaultProps: {
        radius: 'md',
      },
    },
    /** `radius="xl"` is only 16px here — reads as oblong on small avatars; 999 = circular clip. */
    Avatar: {
      defaultProps: {
        radius: 999,
      },
      styles: {
        root: {
          flexShrink: 0,
        },
      },
    },
  },

  other: {
    // Custom properties that might be used elsewhere
    borderColor: {
      light: '#e2e8f0', // slate-200
      dark: '#334155',  // slate-700
    },
    mutedBg: {
      light: '#f8fafc', // slate-50
      dark: '#0f172a',  // slate-900
    },
    mutedText: {
      light: '#64748b', // slate-500
      dark: '#94a3b8',  // slate-400
    },
  },
});
