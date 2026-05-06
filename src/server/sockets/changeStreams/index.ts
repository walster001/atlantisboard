import type { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import { logger } from '../../utils/logger.js';
import { Workspace } from '../../models/Workspace.js';
import { Board } from '../../models/Board.js';
import { List } from '../../models/List.js';
import { Card } from '../../models/Card.js';
import { Activity } from '../../models/Activity.js';
import { BoardLabel } from '../../models/BoardLabel.js';
import { InviteLink } from '../../models/InviteLink.js';
import { isChangeStreamReplicaSetError, shouldRunChangeStreams } from './helpers.js';
import {
  handleActivityChange,
  handleBoardChange,
  handleCardChange,
  handleInviteChange,
  handleLabelChange,
  handleListChange,
  handleWorkspaceChange,
} from './dispatchers.js';
import {
  attachChangeStreamErrorHandler,
  closeAllChangeStreams,
  registerChangeStream,
} from './streamRegistry.js';

export async function setupChangeStreams(io: SocketIOServer): Promise<void> {
  if (!shouldRunChangeStreams()) {
    const dis = process.env.DISABLE_CHANGE_STREAMS?.trim().toLowerCase();
    const en = process.env.ENABLE_CHANGE_STREAMS?.trim().toLowerCase();
    if (dis === 'true' || dis === '1' || dis === 'yes') {
      logger.info('MongoDB Change Streams skipped (DISABLE_CHANGE_STREAMS)');
    } else if (en === 'false' || en === '0' || en === 'no') {
      logger.info('MongoDB Change Streams skipped (ENABLE_CHANGE_STREAMS=false)');
    } else if (process.env.NODE_ENV !== 'production') {
      logger.info(
        'MongoDB Change Streams skipped (non-production default; set ENABLE_CHANGE_STREAMS=true with a replica set to enable)'
      );
    } else {
      logger.info('MongoDB Change Streams skipped');
    }
    return;
  }

  // Socket.io is initialized at module load; MongoDB may still be connecting (async).
  // Wait for the driver before Model.watch(), otherwise mongoose.connection.db is undefined.
  try {
    await mongoose.connection.asPromise();
  } catch (error) {
    logger.error({ error }, 'Cannot initialize Change Streams: MongoDB connection failed');
    return;
  }

  if (!mongoose.connection.db) {
    logger.warn('Database connection not available for Change Streams');
    return;
  }

  try {
    const commonPipeline = [
      {
        $match: {
          operationType: { $in: ['insert', 'update', 'replace', 'delete'] },
        },
      },
    ];

    // Workspace Change Stream
    const workspaceStream = Workspace.watch(commonPipeline, { fullDocument: 'updateLookup' });
    attachChangeStreamErrorHandler(workspaceStream, 'Workspace');
    workspaceStream.on('change', (change) => {
      handleWorkspaceChange(change, io);
    });
    registerChangeStream(workspaceStream);

    // Board Change Stream
    const boardStream = Board.watch(commonPipeline, { fullDocument: 'updateLookup' });
    attachChangeStreamErrorHandler(boardStream, 'Board');
    boardStream.on('change', (change) => {
      handleBoardChange(change, io);
    });
    registerChangeStream(boardStream);

    // List Change Stream
    const listStream = List.watch(commonPipeline, { fullDocument: 'updateLookup' });
    attachChangeStreamErrorHandler(listStream, 'List');
    listStream.on('change', (change) => {
      handleListChange(change, io);
    });
    registerChangeStream(listStream);

    // Card Change Stream
    const cardStream = Card.watch(commonPipeline, { fullDocument: 'updateLookup' });
    attachChangeStreamErrorHandler(cardStream, 'Card');
    cardStream.on('change', (change) => {
      handleCardChange(change, io);
    });
    registerChangeStream(cardStream);

    // Activity Change Stream
    const activityStream = Activity.watch([{ $match: { operationType: 'insert' } }], { fullDocument: 'updateLookup' });
    attachChangeStreamErrorHandler(activityStream, 'Activity');
    activityStream.on('change', (change) => {
      handleActivityChange(change, io);
    });
    registerChangeStream(activityStream);

    // BoardLabel Change Stream
    const labelStream = BoardLabel.watch(commonPipeline, { fullDocument: 'updateLookup' });
    attachChangeStreamErrorHandler(labelStream, 'BoardLabel');
    labelStream.on('change', (change) => {
      handleLabelChange(change, io);
    });
    registerChangeStream(labelStream);

    // InviteLink Change Stream
    const inviteStream = InviteLink.watch(commonPipeline, { fullDocument: 'updateLookup' });
    attachChangeStreamErrorHandler(inviteStream, 'InviteLink');
    inviteStream.on('change', (change) => {
      handleInviteChange(change, io);
    });
    registerChangeStream(inviteStream);

    logger.info('MongoDB Change Streams initialized');
  } catch (error) {
    if (isChangeStreamReplicaSetError(error)) {
      logger.warn(
        'MongoDB Change Streams not available: replica set required (40573). Set ENABLE_CHANGE_STREAMS=false or use a replica set.'
      );
      return;
    }
    logger.error({ error }, 'Error setting up MongoDB Change Streams');
    throw error;
  }
}

// Backward-compatible alias for tests and older imports.
export const initializeChangeStreams = setupChangeStreams;

/**
 * Close all change streams to prevent memory leaks
 */
export async function closeChangeStreams(): Promise<void> {
  await closeAllChangeStreams();
}

