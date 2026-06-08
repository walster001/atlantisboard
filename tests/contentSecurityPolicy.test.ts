import { describe, it, expect } from 'bun:test';
import {
  buildDevelopmentCspDirectives,
  buildProductionCspDirectives,
} from '../src/server/config/contentSecurityPolicy.js';

describe('contentSecurityPolicy config', () => {
  it('allows blob: in production media-src for upload previews', () => {
    const directives = buildProductionCspDirectives({
      appOrigin: 'https://baseimage.atlantis.social',
      minioPublicOrigin: 'https://cdn.example.com',
      styleSrcNonce: () => "'nonce-test'",
    });
    expect(directives.mediaSrc).toContain('blob:');
    expect(directives.mediaSrc).toContain("'self'");
    expect(directives.mediaSrc).toContain('https://baseimage.atlantis.social');
    expect(directives.mediaSrc).toContain('https://cdn.example.com');
  });

  it('allows blob: in development media-src', () => {
    const directives = buildDevelopmentCspDirectives();
    expect(directives.mediaSrc).toContain('blob:');
    expect(directives.imgSrc).toContain('blob:');
  });

  it('omits MinIO origin from media-src when public presign is not configured', () => {
    const directives = buildProductionCspDirectives({
      appOrigin: 'https://app.example.com',
      minioPublicOrigin: null,
      styleSrcNonce: () => "'nonce-test'",
    });
    expect(directives.mediaSrc).toEqual([
      "'self'",
      'blob:',
      'https://app.example.com',
    ]);
  });
});
