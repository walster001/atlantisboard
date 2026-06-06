/** Blob URLs for description media staged during edit; keyed by object URL. */
export type DescriptionPendingMediaRegistry = Map<string, File>;

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
