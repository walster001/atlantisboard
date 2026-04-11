import { describe, it, expect } from 'bun:test';
import { normalizeGoogleOAuthCallbackUrl } from '../src/shared/utils/googleOAuthCallbackUrl.js';

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
