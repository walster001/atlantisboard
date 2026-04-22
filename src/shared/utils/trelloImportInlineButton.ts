/**
 * Defaults for Trello-imported inlineButton nodes — mirrors
 * DEFAULT_INLINE_BUTTON_ATTRS in tiptapInlineButtonExtension.ts (server-safe).
 */
export const TRELLO_IMPORT_INLINE_BUTTON_DEFAULTS = {
  textColor: '#579DFF',
  bgColor: '#1D2125',
  borderRadiusPx: 4,
  iconSizePx: 20,
  width: '320' as string | null,
  offsetXPx: 0,
  offsetYPx: 0,
  wrapperStyle: 'display: flex; justify-content: flex-start;',
} as const;

function inferInlineButtonWidthPxFromLabel(label: string, hasIcon: boolean): string {
  // Keep this heuristic simple and deterministic: approximate text width + paddings.
  const charPx = 8;
  const horizontalPaddingPx = hasIcon ? 68 : 44;
  const minPx = 96;
  const maxPx = 720;
  const px = Math.round(label.length * charPx + horizontalPaddingPx);
  return String(Math.max(minPx, Math.min(maxPx, px)));
}

export function trelloImportContainerStyle(widthPx: string): string {
  return `position: relative; width: ${widthPx}px; max-width: 100%; height: auto; cursor: pointer; box-sizing: border-box; `;
}

const THEME_TRELLO = { textColor: '#0C66E4', bgColor: '#E9F2FF' } as const;
const THEME_DROPBOX = { textColor: '#0061FE', bgColor: '#E8F3FF' } as const;
const THEME_GOOGLE = { textColor: '#188038', bgColor: '#E8F5E9' } as const;
const THEME_MS = { textColor: '#0078D4', bgColor: '#E3F2FD' } as const;

function themeForHref(href: string): { textColor: string; bgColor: string } {
  try {
    const u = new URL(href);
    const host = u.hostname.toLowerCase();
    if (host === 'trello.com' || host.endsWith('.trello.com')) {
      return THEME_TRELLO;
    }
    if (host.includes('dropbox')) {
      return THEME_DROPBOX;
    }
    if (host.includes('drive.google.com') || host.includes('docs.google.com')) {
      return THEME_GOOGLE;
    }
    if (
      host.includes('google.com') ||
      host.includes('googleusercontent.com')
    ) {
      return THEME_GOOGLE;
    }
    if (
      host.includes('onedrive') ||
      host === '1drv.ms' ||
      host.endsWith('.1drv.ms') ||
      host.includes('sharepoint.com')
    ) {
      return THEME_MS;
    }
  } catch {
    /* ignore */
  }
  return {
    textColor: TRELLO_IMPORT_INLINE_BUTTON_DEFAULTS.textColor,
    bgColor: TRELLO_IMPORT_INLINE_BUTTON_DEFAULTS.bgColor,
  };
}

export function faviconUrlForHref(href: string): string | null {
  try {
    const u = new URL(href);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      return null;
    }
    const host = u.hostname.trim().toLowerCase();
    if (host.length === 0) {
      return null;
    }
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return null;
  }
}

function looksLikeUrlOnly(s: string): boolean {
  const t = s.trim();
  return (
    /^https?:\/\//i.test(t) ||
    t.includes('://') ||
    (/\.[a-z0-9]{2,6}\//i.test(t) && t.includes('/'))
  );
}

function filenameStemToTitle(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, '').trim();
  if (base.length === 0) {
    return '';
  }
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Trello smart-card links often use the URL as the markdown link text. Prefer a human label from
 * the path (e.g. Dropbox `.../What-to-say-to-your-parents.mp4` → "What to say to your parents").
 */
export function deriveTrelloSmartLinkButtonLabel(href: string, linkText: string): string {
  const t = linkText.trim();
  const h = href.trim();
  if (t.length > 0 && t !== h && !looksLikeUrlOnly(t)) {
    return t.slice(0, 500);
  }
  try {
    const resolved = /^https?:\/\//i.test(h) ? h : `https://${h}`;
    const u = new URL(resolved);
    const segments = u.pathname.split('/').filter((s) => s.length > 0);
    const last = segments.length > 0 ? segments[segments.length - 1] : '';
    if (last.length > 0) {
      const decoded = decodeURIComponent(last);
      const title = filenameStemToTitle(decoded);
      if (title.length > 0) {
        return title.slice(0, 500);
      }
    }
  } catch {
    /* ignore */
  }
  if (t.length > 0) {
    return t.slice(0, 500);
  }
  return 'Open link';
}

export function shouldTrelloLinkBecomeInlineButton(href: string, linkTitle: string): boolean {
  const t = linkTitle.trim().toLowerCase();
  if (t.includes('smartcard-inline') || t.includes('smartlink')) {
    return true;
  }
  try {
    const u = new URL(href);
    const host = u.hostname.toLowerCase();
    if (host.includes('trello.com') && u.pathname.includes('/c/')) {
      return true;
    }
    if (host.includes('dropbox.com') || host.includes('dropboxusercontent.com')) {
      return true;
    }
    if (host.includes('drive.google.com') || host.includes('docs.google.com')) {
      return true;
    }
    if (host.includes('onedrive') || host.includes('1drv.ms') || host.includes('sharepoint.com')) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export interface InlineButtonDocNode {
  type: 'inlineButton';
  attrs: {
    href: string;
    buttonText: string;
    textColor: string;
    bgColor: string;
    borderRadiusPx: number;
    iconSrc: string | null;
    iconSizePx: number;
    width: string | null;
    offsetXPx: number;
    offsetYPx: number;
    containerStyle: string;
    wrapperStyle: string;
  };
}

export function buildTrelloImportInlineButton(
  href: string,
  buttonText: string
): InlineButtonDocNode | null {
  const trimmedHref = href.trim();
  if (trimmedHref.length === 0) {
    return null;
  }
  let resolved = trimmedHref;
  if (!/^https?:\/\//i.test(resolved)) {
    resolved = `https://${resolved}`;
  }
  const hrefOk =
    resolved.startsWith('https://') ||
    resolved.startsWith('http://') ||
    resolved.startsWith('/') ||
    resolved.startsWith('#') ||
    resolved.startsWith('mailto:');
  if (!hrefOk) {
    return null;
  }
  const theme = themeForHref(resolved);
  const icon = faviconUrlForHref(resolved);
  const btn = buttonText.trim().slice(0, 500);
  const label = btn.length > 0 ? btn : 'Open link';
  const w = inferInlineButtonWidthPxFromLabel(label, icon != null);
  return {
    type: 'inlineButton',
    attrs: {
      href: resolved,
      buttonText: label,
      textColor: theme.textColor,
      bgColor: theme.bgColor,
      borderRadiusPx: TRELLO_IMPORT_INLINE_BUTTON_DEFAULTS.borderRadiusPx,
      iconSrc: icon,
      iconSizePx: TRELLO_IMPORT_INLINE_BUTTON_DEFAULTS.iconSizePx,
      width: w,
      offsetXPx: TRELLO_IMPORT_INLINE_BUTTON_DEFAULTS.offsetXPx,
      offsetYPx: TRELLO_IMPORT_INLINE_BUTTON_DEFAULTS.offsetYPx,
      containerStyle: trelloImportContainerStyle(w),
      wrapperStyle: TRELLO_IMPORT_INLINE_BUTTON_DEFAULTS.wrapperStyle,
    },
  };
}
