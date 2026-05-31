import { describe, it, expect, beforeEach } from 'bun:test';
import { describeDbIntegration } from '../helpers/integrationEnv.js';
import { beforeAllEnsureTestServer } from '../helpers/integrationHooks.js';
import { getAuthToken, clearTestDatabase, injectApp } from '../helpers/testHelpers.js';
import { createMockUser } from '../helpers/mockData.js';
import { User } from '../../src/server/models/User.js';
import { getVapidPublicKey } from '../../src/server/config/vapid.js';

describeDbIntegration('Push Notifications', () => {
  beforeAllEnsureTestServer();
  let authToken: string;
  let userId: string;

  beforeEach(async () => {
    await clearTestDatabase({ waitForHttp: false });
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
      const response = await injectApp({
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
      await injectApp({
        method: 'POST',
        url: '/api/v1/users/me/push-subscription',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: { subscription: mockSubscription },
      });

      // Then delete
      const response = await injectApp({
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
      const response = await injectApp({
        method: 'POST',
        url: '/api/v1/users/me/push-subscription',
        payload: { subscription: mockSubscription },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('VAPID Public Key Endpoint', () => {
    it('should return VAPID public key', async () => {
      const response = await injectApp({
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

