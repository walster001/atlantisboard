import type { Request } from 'express';
import {
  isForceHttpsEnabled,
  resolveRequestProtocol,
} from '../../shared/utils/googleOAuthCallbackUrl.js';

/** Incoming request host + protocol (respects X-Forwarded-Proto and FORCE_HTTPS). */
export function resolveHostOrigin(req: Request): string | undefined {
  const host = req.get('host');
  if (!host) {
    return undefined;
  }
  const proto = resolveRequestProtocol({
    protocol: req.protocol,
    forwardedProto: req.get('x-forwarded-proto') ?? undefined,
    forceHttps: isForceHttpsEnabled({
      FORCE_HTTPS: process.env.FORCE_HTTPS,
    }),
  });
  return `${proto}://${host}`;
}
