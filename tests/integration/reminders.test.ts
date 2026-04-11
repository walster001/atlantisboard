import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../../src/server/index.js';
import { getAuthToken, clearTestDatabase } from '../helpers/testHelpers.js';
import { createMockUser, createMockBoard, createMockList, createMockCard } from '../helpers/mockData.js';
import { Card } from '../../src/server/models/Card.js';
import mongoose from 'mongoose';

const shouldRunDbIntegrationTests =
  Boolean(process.env.MONGODB_TEST_URI) && Boolean(process.env.REDIS_URL);
const describeDb = shouldRunDbIntegrationTests ? describe : describe.skip;

describeDb('Reminders', () => {
  let authToken: string;
  let userId: string;
  let boardId: string;
  let listId: string;
  let cardId: string;

  beforeEach(async () => {
    await clearTestDatabase();
    const user = await createMockUser();
    userId = user._id.toString();
    const tokenData = await getAuthToken(user.email, 'TestPassword123!');
    authToken = tokenData.token;

    const board = await createMockBoard(user._id, user._id);
    boardId = board._id.toString();
    const list = await createMockList(board._id);
    listId = list._id.toString();

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    const card = await createMockCard(list._id, board._id, user._id);
    await Card.findByIdAndUpdate(card._id, { dueDate });
    cardId = card._id.toString();
  });

  describe('Reminder Creation', () => {
    it('should create reminder with custom offset', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/cards/${cardId}/reminders`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          timeOffset: '-2 days',
          repeatFrequency: undefined,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.reminder).toBeDefined();
      expect(body.reminder.timeOffset).toBe('-2 days');
    });

    it('should enforce max 3 reminders per card', async () => {
      // Create 3 reminders
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'POST',
          url: `/api/v1/cards/${cardId}/reminders`,
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
          payload: {
            timeOffset: `-${i} days`,
          },
        });
      }

      // Try to create 4th reminder
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/cards/${cardId}/reminders`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          timeOffset: '-1 day',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.message).toContain('maximum');
    });

    it('should create reminder with repeat frequency', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/cards/${cardId}/reminders`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          timeOffset: '-1 day',
          repeatFrequency: '1 day',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.reminder.repeatFrequency).toBe('1 day');
    });
  });

  describe('Reminder Dismissal', () => {
    it('should dismiss reminder', async () => {
      // Create reminder
      const createResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/cards/${cardId}/reminders`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          timeOffset: '-1 day',
        },
      });

      const createBody = JSON.parse(createResponse.body);
      const reminderId = createBody.reminder.id;

      // Dismiss reminder
      const dismissResponse = await app.inject({
        method: 'PUT',
        url: `/api/v1/cards/${cardId}/reminders/${reminderId}/dismiss`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(dismissResponse.statusCode).toBe(200);
      const dismissBody = JSON.parse(dismissResponse.body);
      expect(dismissBody.reminder.dismissed).toBe(true);
    });
  });

  describe('Reminder Validation', () => {
    it('should require due date on card for reminder', async () => {
      const card = await createMockCard(
        new mongoose.Types.ObjectId(listId),
        new mongoose.Types.ObjectId(boardId),
        new mongoose.Types.ObjectId(userId)
      );
      const cardWithoutDueDate = card._id.toString();

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/cards/${cardWithoutDueDate}/reminders`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          timeOffset: '-1 day',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.message).toContain('due date');
    });
  });
});

