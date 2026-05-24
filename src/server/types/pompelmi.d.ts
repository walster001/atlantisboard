declare module 'pompelmi' {
  import type { Readable } from 'node:stream';

  export const Verdict: {
    readonly Clean: unique symbol;
    readonly Malicious: unique symbol;
    readonly ScanError: unique symbol;
  };

  export type VerdictValue = (typeof Verdict)[keyof typeof Verdict];

  export interface ScanOptions {
    host?: string;
    port?: number;
    socket?: string;
    timeout?: number;
    retries?: number;
    retryDelay?: number;
  }

  export function scan(filePath: string, options?: ScanOptions): Promise<VerdictValue>;
  export function scanBuffer(buffer: Buffer, options?: ScanOptions): Promise<VerdictValue>;
  export function scanStream(stream: Readable, options?: ScanOptions): Promise<VerdictValue>;
}
