import Heading from '@tiptap/extension-heading';
import Paragraph from '@tiptap/extension-paragraph';

function isValidLineHeightToken(s: string): boolean {
  const t = s.trim();
  if (t === 'normal') {
    return true;
  }
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(t)) {
    return false;
  }
  const n = Number.parseFloat(t);
  return Number.isFinite(n) && n >= 0.75 && n <= 3;
}

const lineHeightAttribute = {
  lineHeight: {
    default: null as string | null,
    parseHTML: (element: Element) => {
      if (!(element instanceof HTMLElement)) {
        return null;
      }
      const raw = element.style.lineHeight;
      if (typeof raw !== 'string' || raw.trim() === '') {
        return null;
      }
      const t = raw.trim();
      return isValidLineHeightToken(t) ? t : null;
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const lh = attributes.lineHeight;
      if (typeof lh !== 'string' || lh.trim() === '') {
        return {};
      }
      const t = lh.trim();
      if (!isValidLineHeightToken(t)) {
        return {};
      }
      return { style: `line-height: ${t}` };
    },
  },
};

/** Paragraph with optional `lineHeight` (unitless CSS number or `normal`). */
export const CardDescriptionParagraph = Paragraph.extend({
  addAttributes() {
    const parent = typeof this.parent === 'function' ? this.parent() : {};
    return {
      ...parent,
      ...lineHeightAttribute,
    };
  },
});

/** Heading with optional `lineHeight` (same semantics as {@link CardDescriptionParagraph}). */
export const CardDescriptionHeading = Heading.extend({
  addAttributes() {
    const parent = typeof this.parent === 'function' ? this.parent() : {};
    return {
      ...parent,
      ...lineHeightAttribute,
    };
  },
});
