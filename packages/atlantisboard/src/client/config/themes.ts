export interface ThemeColors {
  primary: string;
  primaryHover: string;
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
}

export const themes = {
  light: {
    primary: '#3b82f6',        // blue-500
    primaryHover: '#2563eb',   // blue-600
    background: '#f8fafc',     // slate-50
    surface: '#ffffff',        // white
    border: '#e2e8f0',         // slate-200
    text: '#0f172a',           // slate-900
    textMuted: '#64748b',      // slate-500
    accent: '#0ea5e9',         // sky-500
  },
  dark: {
    primary: '#3b82f6',        // blue-500
    primaryHover: '#60a5fa',   // blue-400
    background: '#0f172a',     // slate-900
    surface: '#1e293b',        // slate-800
    border: '#334155',         // slate-700
    text: '#f1f5f9',           // slate-100
    textMuted: '#94a3b8',      // slate-400
    accent: '#0ea5e9',         // sky-500
  },
} as const;
