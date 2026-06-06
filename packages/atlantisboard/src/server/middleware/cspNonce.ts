import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export const CSP_NONCE_LOCALS_KEY = 'cspNonce';

export function attachCspNonce(_req: Request, res: Response, next: NextFunction): void {
  res.locals[CSP_NONCE_LOCALS_KEY] = crypto.randomBytes(16).toString('base64');
  next();
}

export function getCspNonceFromResponse(res: Response): string {
  const nonce = res.locals[CSP_NONCE_LOCALS_KEY];
  if (typeof nonce !== 'string' || nonce.length === 0) {
    return crypto.randomBytes(16).toString('base64');
  }
  return nonce;
}
