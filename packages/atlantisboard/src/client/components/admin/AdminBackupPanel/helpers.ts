export function readApiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: unknown } }).response?.data;
    if (data && typeof data === 'object' && 'error' in data) {
      const msg = (data as { error?: { message?: string } }).error?.message;
      if (typeof msg === 'string' && msg.trim() !== '') return msg;
    }
  }
  return err instanceof Error ? err.message : fallback;
}
