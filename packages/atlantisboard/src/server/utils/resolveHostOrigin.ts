import type { Request } from 'express';

/** Incoming request host + protocol (respects X-Forwarded-Proto). */
export function resolveHostOrigin(req: Request): string | undefined {
  const host = req.get('host');
  if (!host) {
    return undefined;
  }
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0]?.trim();
  return `${proto}://${host}`;
}
