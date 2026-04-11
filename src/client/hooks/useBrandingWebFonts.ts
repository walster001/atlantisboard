import { useEffect } from 'react';
import { api } from '../utils/api.js';
import {
  SYSTEM_UI_FONT_FAMILY,
  customFontFormatFromFileName,
  type PublicCustomFontEntry,
} from '../../shared/types/customFonts.js';

export function useBrandingWebFonts(
  appNameFontFamily: string,
  taglineFontFamily: string,
  defaultUiFontFamilyStored?: string | undefined
): void {
  useEffect(() => {
    const extra =
      defaultUiFontFamilyStored !== undefined && defaultUiFontFamilyStored.trim() !== ''
        ? [defaultUiFontFamilyStored.trim()]
        : [];
    const families = [...new Set([appNameFontFamily, taglineFontFamily, ...extra].filter(Boolean))];
    const elements: Array<HTMLLinkElement | HTMLStyleElement> = [];
    let cancelled = false;

    void (async () => {
      let catalog: PublicCustomFontEntry[] = [];
      try {
        const { fonts } = await api.getFontsCatalog();
        if (cancelled) {
          return;
        }
        catalog = fonts;
      } catch {
        if (cancelled) {
          return;
        }
        catalog = [];
      }
      if (cancelled) {
        return;
      }

      const injectedCustom = new Set<string>();
      for (const f of families) {
        if (!f || f.trim() === '' || f === SYSTEM_UI_FONT_FAMILY) {
          continue;
        }
        const entry = catalog.find((e) => e.fontFamilyValue === f);
        if (!entry || injectedCustom.has(entry.fileName)) {
          continue;
        }
        injectedCustom.add(entry.fileName);
        if (cancelled) {
          return;
        }
        const format = customFontFormatFromFileName(entry.fileName);
        const style = document.createElement('style');
        style.setAttribute('data-kb-font-face', entry.fileName);
        const safeName = entry.displayName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const urlJson = JSON.stringify(entry.url);
        /** Variable TrueType/OpenType: weight range so `font-weight` on headings can interpolate. */
        const variableHint =
          format === 'truetype' || format === 'opentype' ? 'font-weight:100 900;' : '';
        style.textContent = `@font-face{font-family:"${safeName}";src:url(${urlJson}) format("${format}");${variableHint}font-display:swap;}`;
        document.head.appendChild(style);
        elements.push(style);
      }
    })();

    return () => {
      cancelled = true;
      for (const el of elements) {
        el.remove();
      }
    };
  }, [appNameFontFamily, taglineFontFamily, defaultUiFontFamilyStored]);
}
