import { describe, expect, test } from 'bun:test';
import {
  buildImportPlaceholderRegistrationMatch,
  DEFAULT_REGISTRATION_MODE,
  isRegistrationModeBlocking,
  registrationBlockReason,
  resolveRegistrationMode,
} from '../src/server/utils/registrationPolicy.js';

describe('registrationPolicy', () => {
  test('resolveRegistrationMode defaults to open', () => {
    expect(resolveRegistrationMode(undefined)).toBe(DEFAULT_REGISTRATION_MODE);
    expect(resolveRegistrationMode(null)).toBe('open');
    expect(resolveRegistrationMode('invite-only')).toBe('invite-only');
  });

  test('isRegistrationModeBlocking allows bootstrap when no users exist', () => {
    expect(isRegistrationModeBlocking('disabled', false)).toBe(false);
    expect(isRegistrationModeBlocking('invite-only', false)).toBe(false);
  });

  test('isRegistrationModeBlocking respects mode when users exist', () => {
    expect(isRegistrationModeBlocking('open', true)).toBe(false);
    expect(isRegistrationModeBlocking('invite-only', true)).toBe(true);
    expect(isRegistrationModeBlocking('disabled', true)).toBe(true);
  });

  test('registrationBlockReason maps modes', () => {
    expect(registrationBlockReason('disabled')).toBe('REGISTRATION_DISABLED');
    expect(registrationBlockReason('invite-only')).toBe('REGISTRATION_INVITE_ONLY');
  });

  test('buildImportPlaceholderRegistrationMatch matches email and distinct username', () => {
    const clauses = buildImportPlaceholderRegistrationMatch('amelia@company.com', 'amelia');
    expect(clauses).toEqual([
      { email: 'amelia@company.com' },
      { importUsername: 'amelia@company.com' },
      { importUsername: 'amelia' },
    ]);
  });

  test('buildImportPlaceholderRegistrationMatch avoids duplicate username clause', () => {
    const clauses = buildImportPlaceholderRegistrationMatch('user@example.com', 'user@example.com');
    expect(clauses).toEqual([
      { email: 'user@example.com' },
      { importUsername: 'user@example.com' },
    ]);
  });
});
