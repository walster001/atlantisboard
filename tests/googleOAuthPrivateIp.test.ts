import { describe, expect, it } from 'bun:test';
import {
  googleOAuthLanDeviceParamsForHostHeader,
  hostnameFromRequestHostHeader,
  isGoogleOAuthPrivateIpHostname,
  resolveGoogleOAuthLanDeviceParams,
} from '../src/shared/utils/googleOAuthPrivateIp.js';

describe('hostnameFromRequestHostHeader', () => {
  it('strips port for IPv4', () => {
    expect(hostnameFromRequestHostHeader('192.168.1.10:3000')).toBe('192.168.1.10');
  });
  it('handles bracketed IPv6', () => {
    expect(hostnameFromRequestHostHeader('[fe80::1]:8080')).toBe('fe80::1');
  });
  it('returns empty for undefined', () => {
    expect(hostnameFromRequestHostHeader(undefined)).toBe('');
  });
});

describe('isGoogleOAuthPrivateIpHostname', () => {
  it('treats RFC1918 IPv4 as private', () => {
    expect(isGoogleOAuthPrivateIpHostname('10.0.0.1')).toBe(true);
    expect(isGoogleOAuthPrivateIpHostname('172.20.1.1')).toBe(true);
    expect(isGoogleOAuthPrivateIpHostname('192.168.0.1')).toBe(true);
    expect(isGoogleOAuthPrivateIpHostname('169.254.1.1')).toBe(true);
    expect(isGoogleOAuthPrivateIpHostname('100.64.0.1')).toBe(true);
  });
  it('excludes loopback and localhost', () => {
    expect(isGoogleOAuthPrivateIpHostname('127.0.0.1')).toBe(false);
    expect(isGoogleOAuthPrivateIpHostname('localhost')).toBe(false);
    expect(isGoogleOAuthPrivateIpHostname('::1')).toBe(false);
  });
  it('treats link-local and ULA IPv6 as private', () => {
    expect(isGoogleOAuthPrivateIpHostname('fe80::1')).toBe(true);
    expect(isGoogleOAuthPrivateIpHostname('fd12:3456::1')).toBe(true);
  });
});

describe('resolveGoogleOAuthLanDeviceParams', () => {
  it('uses env when set', () => {
    const r = resolveGoogleOAuthLanDeviceParams(
      '192.168.1.2',
      { GOOGLE_OAUTH_DEVICE_ID: 'my-id', GOOGLE_OAUTH_DEVICE_NAME: 'my-name' },
      () => 'ignored',
    );
    expect(r).toEqual({ device_id: 'my-id', device_name: 'my-name' });
  });
  it('falls back to host and os hostname', () => {
    const r = resolveGoogleOAuthLanDeviceParams('192.168.1.2', {}, () => 'devbox');
    expect(r.device_id).toBe('private-ip-192.168.1.2');
    expect(r.device_name).toBe('devbox (LAN)');
  });
});

describe('googleOAuthLanDeviceParamsForHostHeader', () => {
  it('returns null for public-style host', () => {
    expect(googleOAuthLanDeviceParamsForHostHeader('example.com:443', {}, () => 'h')).toBeNull();
  });
  it('returns params for private host header', () => {
    const r = googleOAuthLanDeviceParamsForHostHeader('192.168.1.2:3000', {}, () => 'srv');
    expect(r).not.toBeNull();
    expect(r?.device_id).toBe('private-ip-192.168.1.2');
  });
});
