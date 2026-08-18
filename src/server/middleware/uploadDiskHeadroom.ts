import { tmpdir } from 'node:os';
import type { RequestHandler } from 'express';
import {
  assertUploadDiskHeadroom,
  parseRequestContentLengthBytes,
  resolveUploadBytesBudget,
} from '../utils/diskSpaceGuard.js';
import { handleApiRouteError } from '../utils/mapServiceErrorToHttp.js';

/**
 * Pre-multer guard: compare declared upload size against free space on the temp directory.
 */
export function createUploadDiskHeadroomGuard(
  resolveMaxUploadBytes: () => number,
  options?: { readonly directory?: string | (() => string) },
): RequestHandler {
  return async (req, res, next): Promise<void> => {
    try {
      const directoryOption = options?.directory;
      const directory =
        typeof directoryOption === 'function' ? directoryOption() : (directoryOption ?? tmpdir());
      const declaredContentLength = parseRequestContentLengthBytes(req.headers['content-length']);
      const requiredBytes = resolveUploadBytesBudget({
        declaredContentLength,
        maxUploadBytes: resolveMaxUploadBytes(),
      });
      await assertUploadDiskHeadroom({ directory, requiredBytes });
      next();
    } catch (error: unknown) {
      handleApiRouteError(res, error, next);
    }
  };
}
