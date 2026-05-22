/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { displayEmailForImportPlaceholderUser } from '../src/shared/import/importPlaceholderDisplay.js';
import {
  emailFromWekanUserRecord,
  importPreflightUserFromWekanRecord,
  normalizeImportSourceEmail,
} from '../src/shared/import/importSourceUserContact.js';

describe('importSourceUserContact', () => {
  it('reads Wekan user email from several export shapes', () => {
    expect(emailFromWekanUserRecord({ email: 'Direct@Example.com' })).toBe('direct@example.com');
    expect(
      emailFromWekanUserRecord({ emails: [{ address: 'nested@example.com', verified: true }] }),
    ).toBe('nested@example.com');
    expect(emailFromWekanUserRecord({ emails: ['string@example.com'] })).toBe('string@example.com');
    expect(
      emailFromWekanUserRecord({ profile: { fullname: 'A', email: 'profile@example.com' } }),
    ).toBe('profile@example.com');
  });

  it('rejects synthetic placeholder account emails', () => {
    expect(
      normalizeImportSourceEmail('import+wekan+abc@placeholder.import.local'),
    ).toBeUndefined();
    expect(
      displayEmailForImportPlaceholderUser({
        placeholderEmail: 'import+wekan+abc@placeholder.import.local',
        accountEmail: '',
      }),
    ).toBe('');
  });

  it('maps Wekan user record to preflight user with email', () => {
    const user = importPreflightUserFromWekanRecord({
      _id: 'u1',
      username: 'alice',
      emails: [{ address: 'alice@example.com' }],
      profile: { fullname: 'Alice' },
    });
    expect(user).toEqual({
      sourceUserId: 'u1',
      fullName: 'Alice',
      email: 'alice@example.com',
      username: 'alice',
    });
  });

  it('treats Wekan username as email when it is an address (typical Google Wekan export)', () => {
    expect(
      emailFromWekanUserRecord({
        _id: 'u2',
        username: 'Wednesdae.Tulua@Example.com',
        profile: { fullname: 'Wednesdae Tulua' },
      }),
    ).toBe('wednesdae.tulua@example.com');

    const user = importPreflightUserFromWekanRecord({
      _id: 'u2',
      username: 'wednesdae@company.com',
      profile: { fullname: 'Wednesdae Tulua' },
    });
    expect(user).toEqual({
      sourceUserId: 'u2',
      fullName: 'Wednesdae Tulua',
      email: 'wednesdae@company.com',
    });
  });
});
