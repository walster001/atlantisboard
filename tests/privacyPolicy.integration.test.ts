import crypto from 'node:crypto';
import { beforeAll, expect, it } from 'bun:test';
import { describeHttpIntegration } from './helpers/integrationEnv.js';
import { beforeAllEnsureTestServer, INTEGRATION_HOOK_TIMEOUT_MS } from './helpers/integrationHooks.js';
import { apiInject, resetIntegrationHttpSession } from './helpers/integrationHttp.js';
import { ensureMongooseConnectedForHttpIntegration } from './helpers/testHelpers.js';
import { User } from '../src/server/models/User.js';
import { initializeAdminConfig } from '../src/server/models/AdminConfig.js';
import { hashPassword } from '../src/server/utils/password.js';
import { PRIVACY_POLICY_VERSION } from '../src/shared/legal/privacyPolicy.js';

async function createVerifiedUserWithoutPrivacyAcceptance(): Promise<{
  email: string;
  password: string;
}> {
  const nonce = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const email = `privacy-${nonce}@example.com`;
  const password = 'TestPassword123!';
  const passwordHash = await hashPassword(password);

  const user = new User({
    email,
    username: `privacy-${nonce}`,
    displayName: 'Privacy Test User',
    passwordHash,
    emailVerified: true,
    failedLoginAttempts: 0,
  });
  await user.save();

  return { email, password };
}

describeHttpIntegration('Privacy policy API', () => {
  beforeAllEnsureTestServer();

  beforeAll(async () => {
    await ensureMongooseConnectedForHttpIntegration();
    await initializeAdminConfig();
  }, INTEGRATION_HOOK_TIMEOUT_MS);

  it('returns bundled privacy policy document', async () => {
    resetIntegrationHttpSession();

    const response = await apiInject({
      method: 'GET',
      url: '/api/v1/legal/privacy-policy',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      version?: string;
      markdown?: string;
      html?: string;
    };
    expect(body.version).toBe(PRIVACY_POLICY_VERSION);
    expect(body.markdown?.includes('Privacy Notice')).toBe(true);
    expect(body.html?.includes('Privacy')).toBe(true);
  });

  it('requires privacy acceptance on login and persists acceptance', async () => {
    resetIntegrationHttpSession();
    const { email, password } = await createVerifiedUserWithoutPrivacyAcceptance();

    const loginResponse = await apiInject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });

    expect(loginResponse.statusCode).toBe(200);
    const loginBody = JSON.parse(loginResponse.body) as {
      user?: { requiresPrivacyPolicyAcceptance?: boolean };
    };
    expect(loginBody.user?.requiresPrivacyPolicyAcceptance).toBe(true);

    const acceptResponse = await apiInject({
      method: 'POST',
      url: '/api/v1/users/me/privacy-policy-acceptance',
      payload: { version: PRIVACY_POLICY_VERSION },
    });

    expect(acceptResponse.statusCode).toBe(200);
    const acceptBody = JSON.parse(acceptResponse.body) as {
      user?: {
        privacyPolicyAcceptedVersion?: string;
        requiresPrivacyPolicyAcceptance?: boolean;
      };
    };
    expect(acceptBody.user?.privacyPolicyAcceptedVersion).toBe(PRIVACY_POLICY_VERSION);
    expect(acceptBody.user?.requiresPrivacyPolicyAcceptance).toBe(false);

    const user = await User.findOne({ email });
    expect(user?.privacyPolicyAcceptedVersion).toBe(PRIVACY_POLICY_VERSION);
    expect(user?.privacyPolicyAcceptedAt).toBeInstanceOf(Date);
  });
});
