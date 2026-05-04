import { describe, it, expect } from 'bun:test';
import {
  extractGoogleOAuthCallbackPathAndQuery,
  googleOAuthAuthorizeStartUrl,
  googleOAuthRedirectToBrowserOriginIfNeeded,
  normalizeGoogleOAuthCallbackUrl,
  parseGoogleOAuthBrowserOrigin,
  resolveGoogleOAuthPassportCallbackUrl,
  resolvePassportGoogleOAuthCallbackUrl,
} from '../src/shared/utils/googleOAuthCallbackUrl.js';

describe('normalizeGoogleOAuthCallbackUrl', () => {
  it('strips Google Cloud paste suffix after whitespace', () => {
    expect(
      normalizeGoogleOAuthCallbackUrl(
        'http://localhost:3000/api/v1/auth/google/callback flowName=GeneralOAuthFlow'
      )
    ).toBe('http://localhost:3000/api/v1/auth/google/callback');
  });

  it('removes flowName query parameter', () => {
    expect(
      normalizeGoogleOAuthCallbackUrl(
        'http://localhost:3000/api/v1/auth/google/callback?flowName=GeneralOAuthFlow'
      )
    ).toBe('http://localhost:3000/api/v1/auth/google/callback');
  });

  it('preserves relative callback paths', () => {
    expect(normalizeGoogleOAuthCallbackUrl('/api/v1/auth/google/callback')).toBe(
      '/api/v1/auth/google/callback'
    );
  });
});

describe('resolvePassportGoogleOAuthCallbackUrl', () => {
  it('strips loopback absolute URLs in non-production for LAN-friendly Passport resolution', () => {
    expect(
      resolvePassportGoogleOAuthCallbackUrl(
        'http://localhost:3000/api/v1/auth/google/callback',
        'development',
      ),
    ).toBe('/api/v1/auth/google/callback');
    expect(
      resolvePassportGoogleOAuthCallbackUrl(
        'http://127.0.0.1:3000/api/v1/auth/google/callback?x=1',
        'development',
      ),
    ).toBe('/api/v1/auth/google/callback?x=1');
  });

  it('does not rewrite production loopback URLs', () => {
    expect(
      resolvePassportGoogleOAuthCallbackUrl(
        'http://localhost:3000/api/v1/auth/google/callback',
        'production',
      ),
    ).toBe('http://localhost:3000/api/v1/auth/google/callback');
  });

  it('does not rewrite non-loopback absolute URLs in development', () => {
    expect(
      resolvePassportGoogleOAuthCallbackUrl(
        'https://auth.example.com/api/v1/auth/google/callback',
        'development',
      ),
    ).toBe('https://auth.example.com/api/v1/auth/google/callback');
  });
});

describe('parseGoogleOAuthBrowserOrigin', () => {
  it('accepts http(s) origins', () => {
    expect(parseGoogleOAuthBrowserOrigin('http://kanboard.local:3000')?.origin).toBe(
      'http://kanboard.local:3000',
    );
  });
  it('rejects empty and invalid', () => {
    expect(parseGoogleOAuthBrowserOrigin('')).toBeNull();
    expect(parseGoogleOAuthBrowserOrigin('ftp://x')).toBeNull();
  });
});

describe('extractGoogleOAuthCallbackPathAndQuery', () => {
  it('returns path from absolute URL', () => {
    expect(
      extractGoogleOAuthCallbackPathAndQuery('http://ignored:9/api/v1/auth/google/callback?x=1'),
    ).toBe('/api/v1/auth/google/callback?x=1');
  });
});

describe('resolveGoogleOAuthPassportCallbackUrl', () => {
  it('uses browser origin + callback path when set', () => {
    expect(
      resolveGoogleOAuthPassportCallbackUrl({
        normalizedCallback: '/api/v1/auth/google/callback',
        nodeEnv: 'development',
        googleOAuthBrowserOrigin: 'http://kanboard.local:3000',
      }),
    ).toBe('http://kanboard.local:3000/api/v1/auth/google/callback');
  });
  it('falls back to loopback stripping when browser origin unset', () => {
    expect(
      resolveGoogleOAuthPassportCallbackUrl({
        normalizedCallback: 'http://localhost:3000/api/v1/auth/google/callback',
        nodeEnv: 'development',
        googleOAuthBrowserOrigin: undefined,
      }),
    ).toBe('/api/v1/auth/google/callback');
  });
});

describe('googleOAuthAuthorizeStartUrl', () => {
  it('builds authorize URL', () => {
    expect(googleOAuthAuthorizeStartUrl('http://kanboard.local:3000')).toBe(
      'http://kanboard.local:3000/api/v1/auth/google',
    );
  });
});

describe('googleOAuthRedirectToBrowserOriginIfNeeded', () => {
  it('returns null when host matches origin', () => {
    expect(
      googleOAuthRedirectToBrowserOriginIfNeeded(
        'http://kanboard.local:3000',
        'kanboard.local:3000',
        '/api/v1/auth/google',
      ),
    ).toBeNull();
  });
  it('redirects when host differs', () => {
    expect(
      googleOAuthRedirectToBrowserOriginIfNeeded(
        'http://kanboard.local:3000',
        '192.168.1.5:3000',
        '/api/v1/auth/google?next=%2Fboards',
      ),
    ).toBe('http://kanboard.local:3000/api/v1/auth/google?next=%2Fboards');
  });
});
