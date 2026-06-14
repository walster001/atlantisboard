import http from 'node:http';
import https from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import { getMinioCdnPathPrefix, resolveAttachmentPublicBaseUrl } from '../config/attachmentDelivery.js';
import { pipeReadableToServerResponse } from '../utils/pipeReadableToServerResponse.js';
import { logger } from '../utils/logger.js';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
]);

function pickForwardRequestHeaders(incoming: IncomingHttpHeaders): IncomingHttpHeaders {
  const headers: IncomingHttpHeaders = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      continue;
    }
    if (value !== undefined) {
      headers[key] = value;
    }
  }
  return headers;
}

function internalMinioRequestOptions(targetPathWithQuery: string): {
  readonly hostname: string;
  readonly port: number;
  readonly useSSL: boolean;
  readonly path: string;
} {
  const endPoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  const port = Number.parseInt(process.env.MINIO_PORT ?? '9000', 10);
  const useSSL = process.env.MINIO_USE_SSL === 'true';
  return {
    hostname: endPoint,
    port: Number.isFinite(port) ? port : 9000,
    useSSL,
    path: targetPathWithQuery,
  };
}

function handleMinioCdnProxy(req: Request, res: Response): void {
  const prefix = getMinioCdnPathPrefix();
  const original = req.originalUrl;
  if (!original.startsWith(prefix)) {
    res.status(404).end();
    return;
  }

  const targetPathWithQuery = original.slice(prefix.length) || '/';
  const { hostname, port, useSSL, path } = internalMinioRequestOptions(targetPathWithQuery);
  const transport = useSSL ? https : http;
  const presignHost = `${hostname}:${port}`;

  const forwardHeaders = pickForwardRequestHeaders(req.headers);
  forwardHeaders.host = presignHost;

  const proxyReq = transport.request(
    {
      hostname,
      port,
      path,
      method: req.method,
      headers: forwardHeaders,
    },
    (proxyRes) => {
      const responseHeaders: IncomingHttpHeaders = {};
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
          continue;
        }
        if (value !== undefined) {
          responseHeaders[key] = value;
        }
      }
      res.writeHead(proxyRes.statusCode ?? 502, responseHeaders);
      pipeReadableToServerResponse(req, res, proxyRes);
    },
  );

  proxyReq.on('error', (error) => {
    logger.warn(
      { error, path: targetPathWithQuery, event: 'minio.cdn_proxy.error' },
      'MinIO CDN proxy request failed',
    );
    if (!res.headersSent) {
      res.status(502).json({
        error: { message: 'Object storage proxy unavailable', statusCode: 502 },
      });
    } else if (!res.writableEnded) {
      res.destroy();
    }
  });

  proxyReq.end();
}

/** Express router mounted at {@link getMinioCdnPathPrefix} when CDN presign mode is enabled. */
export function createMinioCdnProxyRouter(): Router {
  const router = createRouter();
  router.use((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).setHeader('Allow', 'GET, HEAD').end();
      return;
    }
    handleMinioCdnProxy(req, res);
  });
  return router;
}

export function logMinioCdnProxyEnabled(): void {
  const base = resolveAttachmentPublicBaseUrl();
  if (base == null) {
    return;
  }
  const edgeTermination = process.env.MINIO_CDN_EDGE_TERMINATION === 'true';
  logger.info(
    {
      publicBase: base,
      pathPrefix: getMinioCdnPathPrefix(),
      edgeTermination,
      internalEndpoint: process.env.MINIO_ENDPOINT ?? 'localhost',
      internalPort: process.env.MINIO_PORT ?? '9000',
    },
    edgeTermination
      ? 'MinIO CDN presign enabled; /cdn terminated at reverse proxy (Node proxy disabled)'
      : 'MinIO CDN proxy enabled for presigned attachment delivery',
  );
}
