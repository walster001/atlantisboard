declare module 'unzipper' {
  import type { Writable } from 'node:stream';

  export interface ZipFileEntry {
    readonly path: string;
    buffer(): Promise<Buffer>;
  }

  export interface CentralDirectory {
    readonly files: readonly ZipFileEntry[];
  }

  const unzipper: {
    readonly Extract: (options: { readonly path: string }) => Writable;
    readonly Open: {
      readonly file: (path: string) => Promise<CentralDirectory>;
    };
  };
  export default unzipper;
}
