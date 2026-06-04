import type { PipelineStage } from 'mongoose';

/** Operations watched on most entity collections. */
const MUTATION_OPS = ['insert', 'update', 'replace', 'delete'] as const;

const MATCH_MUTATIONS: PipelineStage = {
  $match: {
    operationType: { $in: [...MUTATION_OPS] },
  },
};

/**
 * Drops Mongoose `__v` from fullDocument. Exclusion-only projection (MongoDB 8+ rejects
 * mixing inclusion and exclusion in the same $project stage).
 */
const PROJECT_WITHOUT_DOC_VERSION: PipelineStage = {
  $project: {
    'fullDocument.__v': 0,
  },
};

export const workspaceChangeStreamPipeline: PipelineStage[] = [MATCH_MUTATIONS, PROJECT_WITHOUT_DOC_VERSION];

export const boardChangeStreamPipeline: PipelineStage[] = [MATCH_MUTATIONS, PROJECT_WITHOUT_DOC_VERSION];

export const listChangeStreamPipeline: PipelineStage[] = [MATCH_MUTATIONS, PROJECT_WITHOUT_DOC_VERSION];

/** Card documents can exceed BSON limits when updateLookup runs on every field change. */
export const cardChangeStreamPipeline: PipelineStage[] = [MATCH_MUTATIONS];

export const activityChangeStreamPipeline: PipelineStage[] = [
  {
    $match: {
      operationType: 'insert',
    },
  },
  PROJECT_WITHOUT_DOC_VERSION,
];

export const boardLabelChangeStreamPipeline: PipelineStage[] = [MATCH_MUTATIONS, PROJECT_WITHOUT_DOC_VERSION];

export const inviteLinkChangeStreamPipeline: PipelineStage[] = [MATCH_MUTATIONS, PROJECT_WITHOUT_DOC_VERSION];
