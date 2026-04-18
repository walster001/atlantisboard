/**
 * `@emoji-mart/data` only types its package entry (`index.d.ts`). Subpath JSON imports need an
 * explicit module declaration for TypeScript to resolve them with `resolveJsonModule`.
 */
declare module '@emoji-mart/data/sets/15/twitter.json' {
  interface TwitterSkin {
    readonly unified: string;
    readonly native: string;
    readonly x: number;
    readonly y: number;
  }

  interface TwitterEmojiEntry {
    readonly skins: readonly TwitterSkin[];
  }

  const twitterData: {
    readonly sheet: { readonly cols: number; readonly rows: number };
    readonly emojis: Readonly<Record<string, TwitterEmojiEntry>>;
  };

  export default twitterData;
}
