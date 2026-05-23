import {
  normalizeBoardThemeSettings,
  type BoardThemeDefinition,
  type BoardThemeSettings,
} from '../../../shared/boardTheme.js';

export type BoardBackgroundImageScaleOption = 'fill' | 'fit' | 'fit-top-left' | 'smart-fill';

export function cloneTheme(theme: BoardThemeDefinition): BoardThemeDefinition {
  return {
    id: theme.id,
    name: theme.name,
    palette: { ...theme.palette },
  };
}

export function toThemeCardItems(
  settings: BoardThemeSettings,
  systemThemes?: readonly BoardThemeDefinition[],
): BoardThemeDefinition[] {
  const defaults = (systemThemes ?? []).map((theme) => cloneTheme(theme));
  const custom = settings.customThemes.map((theme) => cloneTheme(theme));
  const customForCards = custom.map((theme) =>
    theme.id === settings.selectedThemeId ? cloneTheme(settings.selectedTheme) : theme,
  );
  return [...defaults, ...customForCards];
}

function hexToRgbChannels(color: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color.trim());
  if (match == null) {
    return null;
  }
  const raw = match[1];
  const full =
    raw.length === 3 ? `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}` : raw;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return null;
  }
  return { r, g, b };
}

function relativeLuminanceFromHex(color: string): number | null {
  const rgb = hexToRgbChannels(color);
  if (rgb == null) {
    return null;
  }
  const transform = (value: number): number => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * transform(rgb.r) + 0.7152 * transform(rgb.g) + 0.0722 * transform(rgb.b);
}

export function themeCardMiniBoardCanvasBackground(canvasColor: string): string {
  const L = relativeLuminanceFromHex(canvasColor);
  if (L != null && L >= 0.88) {
    return '#e9ecef';
  }
  return canvasColor;
}

export function isBoardDefaultThemeId(
  themeId: string,
  systemThemes?: readonly BoardThemeDefinition[],
): boolean {
  return (systemThemes ?? []).some((entry) => entry.id === themeId);
}

export function buildAddThemeDraft(base: BoardThemeSettings): BoardThemeSettings {
  const newId = `custom-${Date.now()}`;
  const newTheme: BoardThemeDefinition = {
    id: newId,
    name: 'New Theme',
    palette: { ...base.selectedTheme.palette },
  };
  return normalizeBoardThemeSettings(
    {
      ...base,
      selectedThemeId: newId,
      selectedTheme: newTheme,
      customThemes: [...base.customThemes, newTheme],
    },
    base,
  );
}

export function buildEditThemeDraft(base: BoardThemeSettings, themeId: string): BoardThemeSettings {
  const custom = base.customThemes.find((t) => t.id === themeId);
  if (custom == null) {
    return base;
  }
  return normalizeBoardThemeSettings(
    {
      ...base,
      selectedThemeId: themeId,
      selectedTheme: cloneTheme(custom),
    },
    base,
  );
}
