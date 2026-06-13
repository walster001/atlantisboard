/** Blob URLs for description media staged during edit; keyed by object URL. */
export type DescriptionPendingMediaRegistry = Map<string, File>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when serialized description JSON still references staged blob: media URLs. */
export function descriptionJsonHasBlobUrls(jsonString: string): boolean {
  return jsonString.includes('blob:');
}

function collectBlobMediaSrcsFromDescriptionNode(node: unknown, blobs: string[]): void {
  if (!isRecord(node) || typeof node.type !== 'string') {
    return;
  }
  const attrs = node.attrs;
  if (isRecord(attrs)) {
    for (const key of ['src', 'poster', 'iconSrc'] as const) {
      const value = attrs[key];
      if (typeof value === 'string' && isPendingDescriptionMediaSrc(value)) {
        blobs.push(value);
      }
    }
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      collectBlobMediaSrcsFromDescriptionNode(child, blobs);
    }
  }
}

/** Blob media URLs in description JSON that are not registered for upload on save. */
export function findOrphanedBlobUrlsInDescriptionJson(
  jsonString: string,
  registry: DescriptionPendingMediaRegistry,
): readonly string[] {
  if (!descriptionJsonHasBlobUrls(jsonString)) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString) as unknown;
  } catch {
    return ['blob:'];
  }
  const blobs: string[] = [];
  collectBlobMediaSrcsFromDescriptionNode(parsed, blobs);
  return [...new Set(blobs)].filter((url) => !registry.has(url));
}

export function registerPendingDescriptionMediaFile(
  registry: DescriptionPendingMediaRegistry,
  file: File,
): string {
  const blobUrl = URL.createObjectURL(file);
  registry.set(blobUrl, file);
  return blobUrl;
}

export function discardPendingDescriptionMedia(registry: DescriptionPendingMediaRegistry): void {
  for (const blobUrl of registry.keys()) {
    URL.revokeObjectURL(blobUrl);
  }
  registry.clear();
}

export function isPendingDescriptionMediaSrc(src: string): boolean {
  return src.trim().startsWith('blob:');
}

export type UploadDescriptionMediaFile = (
  file: File,
  onProgress?: (progress: number) => void,
) => Promise<string>;

export async function flushPendingDescriptionMediaInJson(
  jsonString: string,
  registry: DescriptionPendingMediaRegistry,
  uploadFile: UploadDescriptionMediaFile,
): Promise<string> {
  if (registry.size === 0) {
    return jsonString;
  }

  let result = jsonString;
  for (const [blobUrl, file] of [...registry.entries()]) {
    if (!result.includes(blobUrl)) {
      URL.revokeObjectURL(blobUrl);
      registry.delete(blobUrl);
      continue;
    }
    const attachmentUrl = await uploadFile(file);
    result = result.split(blobUrl).join(attachmentUrl);
    URL.revokeObjectURL(blobUrl);
    registry.delete(blobUrl);
  }
  return result;
}
