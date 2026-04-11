import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../../src/server/index.js';
import { getAuthToken, clearTestDatabase } from '../helpers/testHelpers.js';
import { createMockUser } from '../helpers/mockData.js';
import { User } from '../../src/server/models/User.js';
import { getVapidPublicKey } from '../../src/server/config/vapid.js';

const shouldRunDbIntegrationTests =
  Boolean(process.env.MONGODB_TEST_URI) && Boolean(process.env.REDIS_URL);
const describeDb = shouldRunDbIntegrationTests ? describe : describe.skip;

describeDb('Push Notifications', () => {
  let authToken: string;
  let userId: string;

  beforeEach(async () => {
    await clearTestDatabase();
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
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/users/me/push-subscription',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: mockSubscription,
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
      await app.inject({
        method: 'POST',
        url: '/api/v1/users/me/push-subscription',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: mockSubscription,
      });

      // Then delete
      const response = await app.inject({
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
      const user = await User.findById(userId).select('+pushSubscription');
      expect(user?.pushSubscription).toBeUndefined();
    });

    it('should require authentication for push subscription', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/users/me/push-subscription',
        payload: mockSubscription,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('VAPID Public Key Endpoint', () => {
    it('should return VAPID public key', async () => {
      const response = await app.inject({
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

