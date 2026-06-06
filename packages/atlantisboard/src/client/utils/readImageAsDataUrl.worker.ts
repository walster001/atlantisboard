/// <reference lib="webworker" />

function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

self.onmessage = (event: MessageEvent<{ file?: File }>) => {
  const file = event.data?.file;
  if (!(file instanceof File)) {
    self.postMessage({ ok: false, error: 'Invalid file payload' });
    return;
  }

  void (async () => {
    try {
      const buffer = await file.arrayBuffer();
      const base64 = uint8ToBase64(new Uint8Array(buffer));
      const mime = typeof file.type === 'string' && file.type.trim() !== '' ? file.type : 'application/octet-stream';
      self.postMessage({ ok: true, dataUrl: `data:${mime};base64,${base64}` });
    } catch {
      self.postMessage({ ok: false, error: 'Could not read selected file' });
    }
  })();
};
