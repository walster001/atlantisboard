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
import { closeAllChangeStreams } from './streamRegistry.js';
import { startCollectionWatch } from './collectionWatch.js';
import {
  activityChangeStreamPipeline,
  boardChangeStreamPipeline,
  boardLabelChangeStreamPipeline,
  cardChangeStreamPipeline,
  inviteLinkChangeStreamPipeline,
  listChangeStreamPipeline,
  workspaceChangeStreamPipeline,
} from './pipelines.js';

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
    await Promise.all([
      startCollectionWatch({
        streamId: 'workspace',
        label: 'Workspace',
        model: Workspace,
        pipeline: workspaceChangeStreamPipeline,
        watchOptions: { fullDocument: 'updateLookup' },
        onChange: (change) => {
          handleWorkspaceChange(change, io);
        },
        io,
      }),
      startCollectionWatch({
        streamId: 'board',
        label: 'Board',
        model: Board,
        pipeline: boardChangeStreamPipeline,
        watchOptions: { fullDocument: 'updateLookup' },
        onChange: (change) => {
          handleBoardChange(change, io);
        },
        io,
      }),
      startCollectionWatch({
        streamId: 'list',
        label: 'List',
        model: List,
        pipeline: listChangeStreamPipeline,
        watchOptions: { fullDocument: 'updateLookup' },
        onChange: (change) => {
          handleListChange(change, io);
        },
        io,
      }),
      startCollectionWatch({
        streamId: 'card',
        label: 'Card',
        model: Card,
        pipeline: cardChangeStreamPipeline,
        watchOptions: {},
        onChange: (change) => {
          handleCardChange(change, io);
        },
        io,
      }),
      startCollectionWatch({
        streamId: 'activity',
        label: 'Activity',
        model: Activity,
        pipeline: activityChangeStreamPipeline,
        watchOptions: {},
        onChange: (change) => {
          handleActivityChange(change, io);
        },
        io,
      }),
      startCollectionWatch({
        streamId: 'boardlabel',
        label: 'BoardLabel',
        model: BoardLabel,
        pipeline: boardLabelChangeStreamPipeline,
        watchOptions: { fullDocument: 'updateLookup' },
        onChange: (change) => {
          handleLabelChange(change, io);
        },
        io,
      }),
      startCollectionWatch({
        streamId: 'invitelink',
        label: 'InviteLink',
        model: InviteLink,
        pipeline: inviteLinkChangeStreamPipeline,
        watchOptions: { fullDocument: 'updateLookup' },
        onChange: (change) => {
          handleInviteChange(change, io);
        },
        io,
      }),
    ]);

    logger.info('MongoDB Change Streams initialized (7 collection watchers, resume tokens in Redis)');
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
