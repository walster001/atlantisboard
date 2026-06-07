import { describe, it, expect, beforeEach } from 'bun:test';
import {
  buildGoogleOAuthCallbackUrlAtRequest,
  extractGoogleOAuthCallbackPathAndQuery,
  googleOAuthAuthorizeStartUrl,
  googleOAuthRedirectToBrowserOriginIfNeeded,
  isForceHttpsEnabled,
  normalizeGoogleOAuthCallbackUrl,
  parseGoogleOAuthBrowserOrigin,
  resolveGoogleOAuthPassportCallbackUrl,
  resolveOAuthPublicBaseUrl,
  resolvePassportGoogleOAuthCallbackUrl,
  resolveRequestProtocol,
  setGoogleOAuthAdminForceHttpsUpgrade,
  upgradeHttpOriginToHttps,
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

describe('resolveRequestProtocol', () => {
  it('prefers X-Forwarded-Proto https', () => {
    expect(
      resolveRequestProtocol({
        protocol: 'http',
        forwardedProto: 'https',
        forceHttps: false,
      }),
    ).toBe('https');
  });

  it('uses forceHttps when forwarded proto is absent', () => {
    expect(
      resolveRequestProtocol({
        protocol: 'http',
        forwardedProto: undefined,
        forceHttps: true,
      }),
    ).toBe('https');
  });

  it('keeps http for local dev without proxy headers', () => {
    expect(
      resolveRequestProtocol({
        protocol: 'http',
        forwardedProto: undefined,
        forceHttps: false,
      }),
    ).toBe('http');
  });
});

describe('buildGoogleOAuthCallbackUrlAtRequest', () => {
  it('builds https callback from relative path when FORCE_HTTPS is on', () => {
    expect(
      buildGoogleOAuthCallbackUrlAtRequest({
        configuredCallback: '/api/v1/auth/google/callback',
        host: 'baseimage.atlantis.social',
        protocol: 'http',
        forwardedProto: undefined,
        forceHttps: true,
        publicBaseUrl: 'https://baseimage.atlantis.social',
      }),
    ).toBe('https://baseimage.atlantis.social/api/v1/auth/google/callback');
  });

  it('builds https callback from relative path when X-Forwarded-Proto is https', () => {
    expect(
      buildGoogleOAuthCallbackUrlAtRequest({
        configuredCallback: '/api/v1/auth/google/callback',
        host: 'baseimage.atlantis.social',
        protocol: 'http',
        forwardedProto: 'https',
        forceHttps: false,
        publicBaseUrl: undefined,
      }),
    ).toBe('https://baseimage.atlantis.social/api/v1/auth/google/callback');
  });

  it('keeps http for localhost dev', () => {
    expect(
      buildGoogleOAuthCallbackUrlAtRequest({
        configuredCallback: '/api/v1/auth/google/callback',
        host: 'localhost:3000',
        protocol: 'http',
        forwardedProto: undefined,
        forceHttps: false,
        publicBaseUrl: undefined,
      }),
    ).toBe('http://localhost:3000/api/v1/auth/google/callback');
  });

  it('upgrades absolute http callback when forceHttps is enabled', () => {
    expect(
      buildGoogleOAuthCallbackUrlAtRequest({
        configuredCallback: 'http://baseimage.atlantis.social/api/v1/auth/google/callback',
        host: 'baseimage.atlantis.social',
        protocol: 'http',
        forwardedProto: undefined,
        forceHttps: true,
        publicBaseUrl: undefined,
      }),
    ).toBe('https://baseimage.atlantis.social/api/v1/auth/google/callback');
  });
});

describe('resolveGoogleOAuthPassportCallbackUrl production HTTPS', () => {
  it('uses APP_URL origin for relative callback in production', () => {
    expect(
      resolveGoogleOAuthPassportCallbackUrl({
        normalizedCallback: '/api/v1/auth/google/callback',
        nodeEnv: 'production',
        googleOAuthBrowserOrigin: undefined,
        publicBaseUrl: 'https://baseimage.atlantis.social',
      }),
    ).toBe('https://baseimage.atlantis.social/api/v1/auth/google/callback');
  });

  it('upgrades stored http callback when forceHttps is enabled', () => {
    expect(
      resolveGoogleOAuthPassportCallbackUrl({
        normalizedCallback: 'http://baseimage.atlantis.social/api/v1/auth/google/callback',
        nodeEnv: 'production',
        googleOAuthBrowserOrigin: undefined,
        forceHttps: true,
      }),
    ).toBe('https://baseimage.atlantis.social/api/v1/auth/google/callback');
  });
});

describe('isForceHttpsEnabled', () => {
  beforeEach(() => {
    setGoogleOAuthAdminForceHttpsUpgrade(undefined);
  });

  it('env true overrides admin false', () => {
    expect(isForceHttpsEnabled({ FORCE_HTTPS: 'true' }, false)).toBe(true);
  });

  it('falls back to admin toggle when env unset', () => {
    expect(isForceHttpsEnabled({}, true)).toBe(true);
    expect(isForceHttpsEnabled({}, false)).toBe(false);
  });
});

describe('resolveOAuthPublicBaseUrl', () => {
  it('prefers OAUTH_REDIRECT_BASE over APP_URL', () => {
    expect(
      resolveOAuthPublicBaseUrl({
        OAUTH_REDIRECT_BASE: 'https://auth.example.com',
        APP_URL: 'https://app.example.com',
        CORS_ORIGIN: 'https://cors.example.com',
      }),
    ).toBe('https://auth.example.com');
  });
});

describe('upgradeHttpOriginToHttps', () => {
  it('upgrades scheme only', () => {
    expect(upgradeHttpOriginToHttps('http://x.test/cb?q=1')).toBe('https://x.test/cb?q=1');
  });
});
