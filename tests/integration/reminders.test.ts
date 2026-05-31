import { describe, it, expect, beforeEach } from 'bun:test';
import { describeDbIntegration } from '../helpers/integrationEnv.js';
import { beforeAllEnsureTestServer } from '../helpers/integrationHooks.js';
import { getAuthToken, clearTestDatabase, injectApp } from '../helpers/testHelpers.js';
import {
  createMockUser,
  createMockBoardForUser,
  createMockList,
  createMockCard,
} from '../helpers/mockData.js';
import { Card } from '../../src/server/models/Card.js';
import mongoose from 'mongoose';

function triggerAtBeforeDue(dueDate: Date, daysBefore: number): string {
  const trigger = new Date(dueDate);
  trigger.setDate(trigger.getDate() - daysBefore);
  return trigger.toISOString();
}

describeDbIntegration('Reminders', () => {
  beforeAllEnsureTestServer();
  let authToken: string;
  let userId: string;
  let boardId: string;
  let listId: string;
  let cardId: string;
  let cardDueDate: Date;

  beforeEach(async () => {
    await clearTestDatabase({ waitForHttp: false });
    const user = await createMockUser();
    userId = user._id.toString();
    const tokenData = await getAuthToken(user.email, 'TestPassword123!');
    authToken = tokenData.token;

    const board = await createMockBoardForUser(user._id);
    boardId = board._id.toString();
    const list = await createMockList(board._id);
    listId = list._id.toString();

    cardDueDate = new Date();
    cardDueDate.setDate(cardDueDate.getDate() + 7);
    const card = await createMockCard(list._id, board._id, user._id);
    await Card.findByIdAndUpdate(card._id, { dueDate: cardDueDate });
    cardId = card._id.toString();
  });

  describe('Reminder Creation', () => {
    it('should create reminder with custom offset', async () => {
      const response = await injectApp({
        method: 'POST',
        url: `/api/v1/cards/${cardId}/reminders`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          triggerAt: triggerAtBeforeDue(cardDueDate, 2),
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as {
        card: { reminders: Array<{ triggerAt: string }> };
      };
      expect(body.card.reminders.length).toBeGreaterThan(0);
      expect(body.card.reminders[0]?.triggerAt).toBeDefined();
    });

    it('should enforce max 3 reminders per card', async () => {
      for (let i = 0; i < 3; i++) {
        await injectApp({
          method: 'POST',
          url: `/api/v1/cards/${cardId}/reminders`,
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
          payload: {
            triggerAt: triggerAtBeforeDue(cardDueDate, i + 1),
          },
        });
      }

      const response = await injectApp({
        method: 'POST',
        url: `/api/v1/cards/${cardId}/reminders`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          triggerAt: triggerAtBeforeDue(cardDueDate, 1),
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as { error: { message: string } };
      expect(body.error.message.toLowerCase()).toContain('maximum');
    });

    it('should create reminder with repeat frequency', async () => {
      const response = await injectApp({
        method: 'POST',
        url: `/api/v1/cards/${cardId}/reminders`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          triggerAt: triggerAtBeforeDue(cardDueDate, 1),
          repeatFrequency: '1 day',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as {
        card: { reminders: Array<{ repeatFrequency?: string }> };
      };
      const reminder = body.card.reminders.find((r) => r.repeatFrequency === '1 day');
      expect(reminder).toBeDefined();
    });
  });

  describe('Reminder Dismissal', () => {
    it('should dismiss reminder', async () => {
      const createResponse = await injectApp({
        method: 'POST',
        url: `/api/v1/cards/${cardId}/reminders`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          triggerAt: triggerAtBeforeDue(cardDueDate, 1),
        },
      });

      const createBody = JSON.parse(createResponse.body) as {
        card: { reminders: Array<{ id: string }> };
      };
      const reminderId = createBody.card.reminders[0]?.id;
      expect(reminderId).toBeDefined();

      const dismissResponse = await injectApp({
        method: 'PUT',
        url: `/api/v1/cards/${cardId}/reminders/${reminderId}/dismiss`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(dismissResponse.statusCode).toBe(200);
      const dismissBody = JSON.parse(dismissResponse.body) as {
        card: { reminders: Array<{ id: string; dismissed: boolean }> };
      };
      const dismissed = dismissBody.card.reminders.find((r) => r.id === reminderId);
      expect(dismissed?.dismissed).toBe(true);
    });
  });

  describe('Reminder Validation', () => {
    it('should require due date on card for reminder', async () => {
      const card = await createMockCard(
        new mongoose.Types.ObjectId(listId),
        new mongoose.Types.ObjectId(boardId),
        new mongoose.Types.ObjectId(userId),
      );
      const cardWithoutDueDate = card._id.toString();

      const response = await injectApp({
        method: 'POST',
        url: `/api/v1/cards/${cardWithoutDueDate}/reminders`,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          triggerAt: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as { error: { message: string } };
      expect(body.error.message.toLowerCase()).toContain('due date');
    });
  });
});
