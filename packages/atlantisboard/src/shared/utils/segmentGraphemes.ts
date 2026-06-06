/** Split a string into user-perceived grapheme clusters (emoji ZWJ sequences stay intact). */
export function segmentGraphemes(input: string): readonly string[] {
  const IntlAny = globalThis.Intl as unknown as {
    Segmenter?: new (
      locales?: unknown,
      options?: { granularity: string },
    ) => {
      segment(s: string): Iterable<{ segment: string }>;
    };
  };
  if (typeof IntlAny.Segmenter === 'function') {
    const seg = new IntlAny.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(seg.segment(input), (part) => part.segment);
  }
  const out: string[] = [];
  for (let i = 0; i < input.length; ) {
    const cp = input.codePointAt(i);
    if (cp === undefined) {
      break;
    }
    const w = cp > 0xffff ? 2 : 1;
    out.push(input.slice(i, i + w));
    i += w;
  }
  return out;
}
