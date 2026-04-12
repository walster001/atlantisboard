import { trelloColorKeyToHex } from './trelloLabelColors.js';

function firstImageUrlFromPrefs(p: Record<string, unknown>): string | undefined {
  const scaled = p.backgroundImageScaled;
  if (Array.isArray(scaled) && scaled.length > 0) {
    const first = scaled[0];
    if (first != null && typeof first === 'object' && !Array.isArray(first)) {
      const u = (first as Record<string, unknown>).url;
      if (typeof u === 'string' && u.trim().length > 0) {
        return u.trim();
      }
    }
  }
  if (typeof p.backgroundImage === 'string' && p.backgroundImage.trim().length > 0) {
    return p.backgroundImage.trim();
  }
  return undefined;
}

/**
 * Maps Trello `prefs` to a single `Board.background` string: image URL, hex colour, or named preset → hex.
 */
export function resolveTrelloBoardBackgroundForImport(prefs: unknown): string | undefined {
  if (prefs == null || typeof prefs !== 'object' || Array.isArray(prefs)) {
    return undefined;
  }
  const p = prefs as Record<string, unknown>;
  const img = firstImageUrlFromPrefs(p);
  if (img != null) {
    return img;
  }
  for (const key of ['backgroundBottomColor', 'backgroundTopColor', 'backgroundColor'] as const) {
    const v = p[key];
    if (typeof v === 'string' && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?$/.test(v.trim())) {
      return v.trim();
    }
  }
  const bg = p.background;
  if (typeof bg === 'string' && bg.trim().length > 0) {
    const t = bg.trim();
    if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?$/.test(t)) {
      return t;
    }
    return trelloColorKeyToHex(t);
  }
  return undefined;
}
