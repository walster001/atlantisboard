import mongoose from 'mongoose';
import { User, type IUser } from '../../src/server/models/User.js';
import { Workspace, type IWorkspace } from '../../src/server/models/Workspace.js';
import { Board, type IBoard } from '../../src/server/models/Board.js';
import { List, type IList } from '../../src/server/models/List.js';
import { Card, type ICard } from '../../src/server/models/Card.js';
import { hashPassword } from '../../src/server/utils/password.js';

export interface MockUserData {
  email: string;
  username: string;
  displayName: string;
  password: string;
}

export async function createMockUser(data?: Partial<MockUserData>): Promise<IUser> {
  const userData: MockUserData = {
    email: data?.email || `test-${Date.now()}@example.com`,
    username: data?.username || `testuser-${Date.now()}`,
    displayName: data?.displayName || 'Test User',
    password: data?.password || 'TestPassword123!',
  };

  const passwordHash = await hashPassword(userData.password);
  const user = new User({
    email: userData.email,
    username: userData.username,
    displayName: userData.displayName,
    passwordHash,
    emailVerified: true,
  });

  await user.save();
  return user;
}

export async function createMockWorkspace(
  ownerId: mongoose.Types.ObjectId,
  name?: string
): Promise<IWorkspace> {
  const workspace = new Workspace({
    name: name || `Test Workspace ${Date.now()}`,
    ownerId,
    members: [],
  });

  await workspace.save();
  return workspace;
}

export async function createMockBoard(
  workspaceId: mongoose.Types.ObjectId,
  ownerId: mongoose.Types.ObjectId,
  name?: string
): Promise<IBoard> {
  const board = new Board({
    workspaceId,
    name: name || `Test Board ${Date.now()}`,
    ownerId,
    members: [],
    visibility: 'workspace',
  });

  await board.save();
  return board;
}

export async function createMockList(
  boardId: mongoose.Types.ObjectId,
  name?: string,
  position?: number
): Promise<IList> {
  const list = new List({
    boardId,
    name: name || `Test List ${Date.now()}`,
    position: position ?? 0,
  });

  await list.save();
  return list;
}

export async function createMockCard(
  listId: mongoose.Types.ObjectId,
  boardId: mongoose.Types.ObjectId,
  createdBy: mongoose.Types.ObjectId,
  title?: string
): Promise<ICard> {
  const card = new Card({
    listId,
    boardId,
    title: title || `Test Card ${Date.now()}`,
    position: 0,
    createdBy,
    labels: [],
    assignees: [],
    reminders: [],
    attachments: [],
    comments: [],
    checklists: [],
  });

  await card.save();
  return card;
}

