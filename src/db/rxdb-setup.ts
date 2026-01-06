/**
 * RxDB Database Setup
 * 
 * Configures RxDB with IndexedDB storage and defines schemas for all entities.
 */

import { createRxDatabase, addRxPlugin, RxDatabase, RxCollection } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';

// Add dev mode plugin in development
if (import.meta.env.DEV) {
  // Note: RxDB dev mode plugin is optional and may not be available
  // We'll skip it if it causes issues
}

// Define schemas for all entities
const boardSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    workspaceId: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
    description: { type: 'string' },
    backgroundColor: { type: 'string' },
    position: { type: 'number' },
    createdBy: { type: 'string' },
    themeId: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['id', 'workspaceId', 'name'],
  indexes: ['workspaceId', 'position'],
};

const columnSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    boardId: { type: 'string', maxLength: 100 },
    title: { type: 'string' },
    position: { type: 'number' },
    color: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['id', 'boardId', 'title'],
  indexes: ['boardId', 'position'],
};

const cardSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    columnId: { type: 'string', maxLength: 100 },
    title: { type: 'string' },
    description: { type: 'string' },
    position: { type: 'number' },
    dueDate: { type: 'string' },
    createdBy: { type: 'string' },
    color: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['id', 'columnId', 'title'],
  indexes: ['columnId', 'position'],
};

const labelSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    boardId: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
    color: { type: 'string' },
  },
  required: ['id', 'boardId', 'name', 'color'],
  indexes: ['boardId'],
};

const cardLabelSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    cardId: { type: 'string', maxLength: 100 },
    labelId: { type: 'string', maxLength: 100 },
  },
  required: ['id', 'cardId', 'labelId'],
  indexes: ['cardId', 'labelId'],
};

const cardAttachmentSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    cardId: { type: 'string', maxLength: 100 },
    fileName: { type: 'string' },
    fileUrl: { type: 'string' },
    fileSize: { type: 'number' },
    fileType: { type: 'string' },
    uploadedBy: { type: 'string' },
    createdAt: { type: 'string' },
  },
  required: ['id', 'cardId', 'fileName', 'fileUrl'],
  indexes: ['cardId'],
};

const cardSubtaskSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    cardId: { type: 'string', maxLength: 100 },
    title: { type: 'string' },
    completed: { type: 'boolean' },
    completedAt: { type: 'string' },
    completedBy: { type: 'string' },
    position: { type: 'number' },
    checklistName: { type: 'string' },
    createdAt: { type: 'string' },
  },
  required: ['id', 'cardId', 'title'],
  indexes: ['cardId', 'position'],
};

const boardMemberSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    boardId: { type: 'string', maxLength: 100 },
    userId: { type: 'string', maxLength: 100 },
    role: { type: 'string' },
    profiles: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        fullName: { type: 'string' },
        avatarUrl: { type: 'string' },
      },
    },
  },
  required: ['id', 'boardId', 'userId', 'role'],
  indexes: ['boardId', 'userId'],
};

const workspaceSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
    description: { type: 'string' },
    ownerId: { type: 'string', maxLength: 100 },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['id', 'name', 'ownerId'],
  indexes: ['ownerId'],
};

const workspaceMemberSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    workspaceId: { type: 'string', maxLength: 100 },
    userId: { type: 'string', maxLength: 100 },
    role: { type: 'string' },
  },
  required: ['id', 'workspaceId', 'userId'],
  indexes: ['workspaceId', 'userId'],
};

// Database type definition
export interface KanboardDatabase extends RxDatabase {
  boards: RxCollection<BoardDocument>;
  columns: RxCollection<ColumnDocument>;
  cards: RxCollection<CardDocument>;
  labels: RxCollection<LabelDocument>;
  cardLabels: RxCollection<CardLabelDocument>;
  cardAttachments: RxCollection<CardAttachmentDocument>;
  cardSubtasks: RxCollection<CardSubtaskDocument>;
  boardMembers: RxCollection<BoardMemberDocument>;
  workspaces: RxCollection<WorkspaceDocument>;
  workspaceMembers: RxCollection<WorkspaceMemberDocument>;
}

// Document type definitions
export type BoardDocument = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  backgroundColor: string | null;
  position: number;
  createdBy: string | null;
  themeId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ColumnDocument = {
  id: string;
  boardId: string;
  title: string;
  position: number;
  color: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CardDocument = {
  id: string;
  columnId: string;
  title: string;
  description: string | null;
  position: number;
  dueDate: string | null;
  createdBy: string | null;
  color: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type LabelDocument = {
  id: string;
  boardId: string;
  name: string;
  color: string;
};

export type CardLabelDocument = {
  id: string;
  cardId: string;
  labelId: string;
};

export type CardAttachmentDocument = {
  id: string;
  cardId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  fileType: string | null;
  uploadedBy: string | null;
  createdAt: string;
};

export type CardSubtaskDocument = {
  id: string;
  cardId: string;
  title: string;
  completed: boolean;
  completedAt: string | null;
  completedBy: string | null;
  position: number;
  checklistName: string | null;
  createdAt: string;
};

export type BoardMemberDocument = {
  id: string;
  boardId: string;
  userId: string;
  role: string;
  profiles: {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
  };
};

export type WorkspaceDocument = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkspaceMemberDocument = {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
};

// Singleton database instance
let db: KanboardDatabase | null = null;

/**
 * Create and initialize the RxDB database
 */
export async function createRxDatabase(): Promise<KanboardDatabase> {
  if (db) {
    return db;
  }

  try {
    db = await createRxDatabase({
      name: 'kanboard',
      storage: getRxStorageDexie(),
      ignoreDuplicate: true,
    });

    await db.addCollections({
      boards: { schema: boardSchema },
      columns: { schema: columnSchema },
      cards: { schema: cardSchema },
      labels: { schema: labelSchema },
      cardLabels: { schema: cardLabelSchema },
      cardAttachments: { schema: cardAttachmentSchema },
      cardSubtasks: { schema: cardSubtaskSchema },
      boardMembers: { schema: boardMemberSchema },
      workspaces: { schema: workspaceSchema },
      workspaceMembers: { schema: workspaceMemberSchema },
    });

    console.log('[RxDB] Database initialized successfully');
    return db;
  } catch (error) {
    console.error('[RxDB] Error initializing database:', error);
    throw error;
  }
}

/**
 * Get the database instance (creates if not exists)
 */
export async function getRxDatabase(): Promise<KanboardDatabase> {
  if (!db) {
    return await createRxDatabase();
  }
  return db;
}

/**
 * Clear all data from the database (useful for testing or logout)
 */
export async function clearRxDatabase(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
}

