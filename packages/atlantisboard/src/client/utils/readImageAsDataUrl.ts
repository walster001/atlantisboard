type WorkerSuccess = { ok: true; dataUrl: string };
type WorkerFailure = { ok: false; error?: string };
type WorkerResult = WorkerSuccess | WorkerFailure;

function readImageAsDataUrlFallback(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result === '') {
        reject(new Error('Could not read selected file'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read selected file'));
    reader.readAsDataURL(file);
  });
}

export async function readImageAsDataUrl(file: File): Promise<string> {
  if (typeof Worker === 'undefined') {
    return readImageAsDataUrlFallback(file);
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./readImageAsDataUrl.worker.ts', import.meta.url), {
      type: 'module',
    });

    const cleanup = (): void => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<WorkerResult>) => {
      const data = event.data;
      cleanup();
      if (data.ok) {
        resolve(data.dataUrl);
      } else {
        reject(new Error(data.error ?? 'Could not read selected file'));
      }
    };

    worker.onerror = () => {
      cleanup();
      void readImageAsDataUrlFallback(file).then(resolve).catch(reject);
    };

    worker.postMessage({ file });
  });
}
