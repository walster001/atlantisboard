import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  createSignedAssetUrl,
  rewriteBrandingPathToSigned,
  verifySignedAssetUrl,
} from '../src/server/utils/signedAssetUrl.js';

describe('signedAssetUrl', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_SIGN_SECRET = 'test-media-sign-secret-with-enough-length';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('rewriteBrandingPathToSigned strips stale query params before re-signing', () => {
    const path = '/api/v1/branding/favicon/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png';
    const signed = rewriteBrandingPathToSigned(`${path}?exp=1&sig=deadbeef`);
    expect(signed).toBeDefined();
    expect(signed).toMatch(/^\/api\/v1\/branding\/favicon\/[a-f0-9-]+\.png\?exp=\d+&sig=[a-f0-9]+$/);
    const query = signed?.split('?')[1] ?? '';
    const params = new URLSearchParams(query);
    expect(
      verifySignedAssetUrl(path, params.get('exp') ?? undefined, params.get('sig') ?? undefined),
    ).toBe(true);
  });

  it('createSignedAssetUrl verifies against path without query', () => {
    const path = '/api/v1/branding/home-bg-image/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
    const signed = createSignedAssetUrl(path, 3600);
    const url = new URL(signed, 'http://localhost:3000');
    expect(
      verifySignedAssetUrl(
        url.pathname,
        url.searchParams.get('exp') ?? undefined,
        url.searchParams.get('sig') ?? undefined,
      ),
    ).toBe(true);
  });
});
