/// <reference types="bun-types" />
import { afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { CSRF_COOKIE_NAME, readCsrfCookie, waitForCsrfCookie } from '../src/client/utils/csrfCookie.js';

function installDocumentCookieMock(): void {
  const jar = new Map<string, string>();
  globalThis.document = {
    get cookie() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    set cookie(value: string) {
      const [pair] = value.split(';');
      const eq = pair?.indexOf('=') ?? -1;
      if (eq < 0) {
        return;
      }
      const name = pair!.slice(0, eq).trim();
      const val = pair!.slice(eq + 1).trim();
      if (val === '' || value.includes('Max-Age=0')) {
        jar.delete(name);
        return;
      }
      jar.set(name, val);
    },
  } as Document;
}

describe('readCsrfCookie', () => {
  beforeAll(() => {
    installDocumentCookieMock();
  });

  afterEach(() => {
    document.cookie = `${CSRF_COOKIE_NAME}=; Max-Age=0; path=/`;
  });

  it('returns null when cookie is absent', () => {
    expect(readCsrfCookie()).toBeNull();
  });

  it('reads csrf-token cookie value', () => {
    document.cookie = `${CSRF_COOKIE_NAME}=abc123; path=/`;
    expect(readCsrfCookie()).toBe('abc123');
  });

  it('decodes URI-encoded cookie values', () => {
    document.cookie = `${CSRF_COOKIE_NAME}=${encodeURIComponent('a+b/c=')}; path=/`;
    expect(readCsrfCookie()).toBe('a+b/c=');
  });

  it('waitForCsrfCookie resolves when cookie appears asynchronously', async () => {
    const pending = waitForCsrfCookie(500);
    setTimeout(() => {
      document.cookie = `${CSRF_COOKIE_NAME}=delayed; path=/`;
    }, 30);
    await expect(pending).resolves.toBe('delayed');
  });
});
