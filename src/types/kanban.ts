// Preset label colors with their hex values
export const LABEL_COLORS = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
} as const;

export type LabelColorName = keyof typeof LABEL_COLORS;

// Color can be a preset name OR a hex color string
export type LabelColor = string;

export interface Label {
  id: string;
  color: LabelColor; // hex color string like "#3b82f6"
  text?: string;
}

// Helper to get hex color from name or return as-is if already hex
export function getLabelHexColor(color: string): string {
  if (color.startsWith('#')) return color;
  return LABEL_COLORS[color as LabelColorName] || LABEL_COLORS.blue;
}

export interface Card {
  id: string;
  title: string;
  description?: string;
  labels: Label[];
  dueDate?: string;
  createdAt: string;
  color?: string | null;
}

export interface Column {
  id: string;
  title: string;
  cards: Card[];
  color?: string | null;
}

export interface Board {
  id: string;
  title: string;
  columns: Column[];
}
