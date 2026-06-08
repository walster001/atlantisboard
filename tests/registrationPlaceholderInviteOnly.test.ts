/// <reference types="bun-types" />
import { expect, test } from 'bun:test';
import mongoose from 'mongoose';
import { BoardImportPlaceholder } from '../src/server/models/BoardImportPlaceholder.js';
import { User } from '../src/server/models/User.js';
import { AdminConfig } from '../src/server/models/AdminConfig.js';
import {
  assertNewUserRegistrationAllowed,
  hasImportPlaceholderForRegistrationIdentity,
} from '../src/server/utils/registrationPolicy.js';
import { describeMongoTest } from './helpers/integrationEnv.js';
import { connectTestDatabase } from './helpers/testHelpers.js';

async function seedRegisteredUser(email: string, username: string): Promise<void> {
  const existing = await User.findOne({ email });
  if (existing != null) {
    return;
  }
  await User.create({
    email,
    username,
    displayName: 'Existing user',
    emailVerified: true,
    failedLoginAttempts: 0,
    isAppAdmin: false,
    foundingAppAdmin: false,
  });
}

describeMongoTest('registration invite-only placeholder bypass', () => {
  test('allows registration when email matches BoardImportPlaceholder', async () => {
    await connectTestDatabase();
    await seedRegisteredUser('existing-for-placeholder@example.com', 'existingph1');

    const boardId = new mongoose.Types.ObjectId();
    await BoardImportPlaceholder.create({
      boardId,
      source: 'wekan',
      sourceUserId: 'src-1',
      displayName: 'Amelia',
      email: 'placeholder-invite@example.com',
      roleKey: 'viewer',
    });

    await AdminConfig.findOneAndUpdate(
      {},
      { $set: { registrationMode: 'invite-only' } },
      { upsert: true },
    );

    expect(await hasImportPlaceholderForRegistrationIdentity('placeholder-invite@example.com')).toBe(
      true,
    );
    const decision = await assertNewUserRegistrationAllowed({
      email: 'placeholder-invite@example.com',
      username: 'amelia',
    });
    expect(decision).toEqual({ allowed: true });

    await BoardImportPlaceholder.deleteMany({ boardId });
    await AdminConfig.deleteMany({});
  });

  test('allows registration when email matches legacy User placeholder', async () => {
    await connectTestDatabase();
    await seedRegisteredUser('existing-for-legacy@example.com', 'existingph2');

    await User.create({
      email: 'legacy-placeholder@example.com',
      username: 'legacyph',
      displayName: 'Legacy',
      isPlaceholder: true,
      placeholderEmail: 'legacy-placeholder@example.com',
      emailVerified: false,
    });

    await AdminConfig.findOneAndUpdate(
      {},
      { $set: { registrationMode: 'invite-only' } },
      { upsert: true },
    );

    const decision = await assertNewUserRegistrationAllowed({
      email: 'legacy-placeholder@example.com',
      username: 'newuser',
    });
    expect(decision).toEqual({ allowed: true });

    await User.deleteMany({ email: 'legacy-placeholder@example.com' });
    await AdminConfig.deleteMany({});
  });

  test('blocks registration in invite-only when no placeholder match', async () => {
    await connectTestDatabase();
    await seedRegisteredUser('existing-for-stranger@example.com', 'existingph3');

    await AdminConfig.findOneAndUpdate(
      {},
      { $set: { registrationMode: 'invite-only' } },
      { upsert: true },
    );

    const decision = await assertNewUserRegistrationAllowed({
      email: 'stranger@example.com',
      username: 'stranger',
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe('REGISTRATION_INVITE_ONLY');
    }

    await AdminConfig.deleteMany({});
  });
});
