/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  activityChangeStreamPipeline,
  cardChangeStreamPipeline,
  workspaceChangeStreamPipeline,
} from '../../src/server/sockets/changeStreams/pipelines.js';

describe('change stream pipelines', () => {
  it('watches insert-only activity events', () => {
    const match = activityChangeStreamPipeline[0] as { $match?: { operationType?: string } };
    expect(match.$match?.operationType).toBe('insert');
  });

  it('does not use updateLookup projection stages on cards', () => {
    expect(cardChangeStreamPipeline.length).toBe(1);
    expect(cardChangeStreamPipeline[0]).toHaveProperty('$match');
  });

  it('strips __v from workspace fullDocument via exclusion-only $project', () => {
    const project = workspaceChangeStreamPipeline[1] as { $project?: Record<string, unknown> };
    expect(project.$project).toEqual({ 'fullDocument.__v': 0 });
  });
});
