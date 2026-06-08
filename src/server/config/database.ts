import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

function resolveMongoUri(): string {
  return process.env.MONGODB_URI?.trim() || 'mongodb://localhost:27017/kanboard';
}

/** Database name from URI path (for startup logs — not used for connect). */
function mongoDatabaseNameFromUri(uri: string): string {
  try {
    const normalized = uri.replace(/^mongodb\+srv:\/\//, 'https://').replace(/^mongodb:\/\//, 'http://');
    const pathname = new URL(normalized).pathname.replace(/^\//, '');
    const dbName = pathname.split('/')[0]?.split('?')[0];
    return dbName && dbName.length > 0 ? dbName : 'test';
  } catch {
    return 'unknown';
  }
}

const connectionOptions: mongoose.ConnectOptions = {
  maxPoolSize: 50,
  minPoolSize: 10,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 30000,
  connectTimeoutMS: 30000,
  heartbeatFrequencyMS: 10000,
  maxIdleTimeMS: 300000, // 5 minutes
};

let isConnected = false;
let connectionListenersRegistered = false;

function registerConnectionListenersOnce(): void {
  if (connectionListenersRegistered) {
    return;
  }
  connectionListenersRegistered = true;

  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected');
    isConnected = true;
  });

  mongoose.connection.on('error', (err) => {
    logger.error({ err }, 'MongoDB connection error');
    isConnected = false;
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
    isConnected = false;
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
    isConnected = true;
  });
}

export async function connectDatabase(): Promise<void> {
  registerConnectionListenersOnce();

  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    return;
  }

  try {
    const mongoUri = resolveMongoUri();
    const databaseName = mongoDatabaseNameFromUri(mongoUri);
    await mongoose.connect(mongoUri, connectionOptions);
    isConnected = true;
    logger.info(
      { database: mongoose.connection.db?.databaseName ?? databaseName },
      'Database connection established',
    );
  } catch (error) {
    logger.error({ error }, 'Failed to connect to database');
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    isConnected = false;
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('Database disconnected');
  } catch (error) {
    logger.error({ error }, 'Error disconnecting from database');
    throw error;
  }
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    if (!isConnected || mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      return false;
    }
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}
