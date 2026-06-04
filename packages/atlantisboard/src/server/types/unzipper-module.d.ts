declare module 'unzipper' {
  import type { Writable } from 'node:stream';

  const unzipper: {
    readonly Extract: (options: { readonly path: string }) => Writable;
  };
  export default unzipper;
}
