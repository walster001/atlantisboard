import { describe, it, expect, beforeEach, beforeAll } from 'bun:test';
import { describeWhenDeps, INTEGRATION_HOOK_TIMEOUT_MS } from '../helpers/integrationEnv.js';
import { getAuthToken, prepareIntegrationTestDatabase } from '../helpers/testHelpers.js';
import { ensureTestServer } from '../helpers/testServer.js';
import { apiInject } from '../helpers/integrationHttp.js';
import { createMockUser } from '../helpers/mockData.js';
import { User } from '../../src/server/models/User.js';
import { getVapidPublicKey } from '../../src/server/config/vapid.js';

describeWhenDeps({ mongo: true, redis: true, mongoTestUriOnly: true }, 'Push Notifications', () => {
  beforeAll(async () => {
    await ensureTestServer();
  }, INTEGRATION_HOOK_TIMEOUT_MS);
  let authToken: string;
  let userId: string;

  beforeEach(async () => {
    await prepareIntegrationTestDatabase();
    const user = await createMockUser();
    userId = user._id.toString();
    const tokenData = await getAuthToken(user.email, 'TestPassword123!');
    authToken = tokenData.token;
  });

  describe('VAPID Key Management', () => {
    it('should retrieve VAPID public key', async () => {
      const publicKey = await getVapidPublicKey();
      expect(publicKey).toBeDefined();
      expect(typeof publicKey).toBe('string');
      expect(publicKey.length).toBeGreaterThan(0);
    });
  });

  describe('Push Subscription Management', () => {
    const mockSubscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys: {
        p256dh: 'test-p256dh-key',
        auth: 'test-auth-key',
      },
    };

    it('should register push subscription', async () => {
      const response = await apiInject({
        method: 'POST',
        url: '/api/v1/users/me/push-subscription',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: { subscription: mockSubscription },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('registered');

      // Verify subscription is saved
      const user = await User.findById(userId).select('+pushSubscription');
      expect(user?.pushSubscription).toBeDefined();
    });

    it('should delete push subscription', async () => {
      // First register
      await apiInject({
        method: 'POST',
        url: '/api/v1/users/me/push-subscription',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: { subscription: mockSubscription },
      });

      // Then delete
      const response = await apiInject({
        method: 'DELETE',
        url: '/api/v1/users/me/push-subscription',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('removed');

      // Verify subscription is removed
      const user = await User.findById(userId).select('+pushSubscription').lean();
      expect(user?.pushSubscription?.endpoint).toBeUndefined();
    });

    it('should require authentication for push subscription', async () => {
      const response = await apiInject({
        method: 'POST',
        url: '/api/v1/users/me/push-subscription',
        payload: { subscription: mockSubscription },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('VAPID Public Key Endpoint', () => {
    it('should return VAPID public key', async () => {
      const response = await apiInject({
        method: 'GET',
        url: '/api/v1/users/vapid-public-key',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('publicKey');
      expect(typeof body.publicKey).toBe('string');
    });
  });
});

