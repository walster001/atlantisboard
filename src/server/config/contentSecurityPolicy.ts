/** Helmet Content-Security-Policy directive builders. */

import type { IncomingMessage, ServerResponse } from 'node:http';

type CspNonceFn = (req: IncomingMessage, res: ServerResponse) => string;

export interface ProductionCspInput {
  readonly appOrigin: string;
  readonly minioPublicOrigin: string | null;
  /** Helmet nonce callback — receives (req, res) and returns `'nonce-…'`. */
  readonly styleSrcNonce: CspNonceFn;
}

export type CspDirectives = Record<
  string,
  | readonly string[]
  | readonly (string | CspNonceFn)[]
  | readonly string[]
  | null
>;

function minioCspExtras(minioPublicOrigin: string | null): readonly string[] {
  return minioPublicOrigin != null && minioPublicOrigin !== '' ? [minioPublicOrigin] : [];
}

/** Production CSP — strict nonce styles; blob URLs allowed for upload previews. */
export function buildProductionCspDirectives(input: ProductionCspInput): CspDirectives {
  const appOrigin = input.appOrigin.replace(/\/$/, '');
  const minioExtras = minioCspExtras(input.minioPublicOrigin);
  return {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", input.styleSrcNonce],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
    connectSrc: [
      "'self'",
      ...(appOrigin !== '' ? [appOrigin] : []),
      ...minioExtras,
      'wss:',
    ],
    fontSrc: ["'self'", 'data:'],
    objectSrc: ["'none'"],
    mediaSrc: [
      "'self'",
      'blob:',
      ...(appOrigin !== '' ? [appOrigin] : []),
      ...minioExtras,
    ],
    frameSrc: ["'none'"],
    upgradeInsecureRequests: [],
  };
}

/** Development CSP — relaxed inline/eval for Vite/HMR. */
export function buildDevelopmentCspDirectives(): CspDirectives {
  return {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
    connectSrc: ["'self'", 'ws:', 'wss:'],
    fontSrc: ["'self'", 'data:'],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'", 'blob:'],
    frameSrc: ["'none'"],
    upgradeInsecureRequests: null,
  };
}
