/** CSP nonce from SPA shell (production). Used for dynamically injected `<style>` tags. */
export function getCspNonce(): string | undefined {
  const meta = document.querySelector('meta[name="csp-nonce"]');
  const value = meta?.getAttribute('content')?.trim();
  return value != null && value.length > 0 ? value : undefined;
}
