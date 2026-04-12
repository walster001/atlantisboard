/**
 * Trello card descriptions often mix Markdown with HTML from the rich editor.
 * `markdown-it` with `html: false` leaves `<ol>/<ul>` as literal text, so lists
 * become plain paragraphs. Convert simple, non-nested list blocks to CommonMark
 * lines before parsing.
 */

const OL_BLOCK = /<\s*ol(\b[^>]*)>([\s\S]*?)<\s*\/\s*ol\s*>/gi;
const UL_BLOCK = /<\s*ul(\b[^>]*)>([\s\S]*?)<\s*\/\s*ul\s*>/gi;
const LI_ITEM = /<\s*li\b[^>]*>([\s\S]*?)<\s*\/\s*li\s*>/gi;

function readOlStart(attr: string): number {
  const m = /\bstart\s*=\s*["']?(\d+)["']?/i.exec(attr);
  if (m == null) {
    return 1;
  }
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function stripLiFragmentToText(fragment: string): string {
  let t = fragment
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(div|p)\s*>/gi, '\n')
    .replace(/<\s*(div|p)\b[^>]*>/gi, '');
  t = t.replace(/<[^>]+>/g, '');
  return t
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function olBlockToMarkdown(attr: string, inner: string): string {
  const start = readOlStart(attr);
  const items: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(LI_ITEM.source, LI_ITEM.flags);
  while ((m = re.exec(inner)) !== null) {
    const body = stripLiFragmentToText(m[1]);
    if (body.length > 0) {
      items.push(body);
    }
  }
  if (items.length === 0) {
    return '';
  }
  return items.map((body, i) => `${start + i}. ${body}`).join('\n');
}

function ulBlockToMarkdown(_attr: string, inner: string): string {
  const items: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(LI_ITEM.source, LI_ITEM.flags);
  while ((m = re.exec(inner)) !== null) {
    const body = stripLiFragmentToText(m[1]);
    if (body.length > 0) {
      items.push(`- ${body}`);
    }
  }
  return items.join('\n');
}

/**
 * When the description contains simple `<ol>` / `<ul>` blocks, rewrite them to
 * Markdown list syntax so `markdown-it` produces `orderedList` / `bulletList`.
 */
export function preprocessTrelloDescriptionForMarkdown(src: string): string {
  if (!src.includes('<')) {
    return src;
  }
  let out = src;
  out = out.replace(OL_BLOCK, (_, attr: string, inner: string) => olBlockToMarkdown(attr, inner));
  out = out.replace(UL_BLOCK, (_, attr: string, inner: string) => ulBlockToMarkdown(attr, inner));
  return out;
}
