import type { PipelineStage } from 'mongoose';

/** Operations watched on most entity collections. */
const MUTATION_OPS = ['insert', 'update', 'replace', 'delete'] as const;

const MATCH_MUTATIONS: PipelineStage = {
  $match: {
    operationType: { $in: [...MUTATION_OPS] },
  },
};

/**
 * Drops MongoDB internal version keys from change events when fullDocument is present.
 * Does not remove application fields required by socket payloads.
 */
const PROJECT_WITHOUT_DOC_VERSION: PipelineStage = {
  $project: {
    _id: 1,
    operationType: 1,
    documentKey: 1,
    updateDescription: 1,
    clusterTime: 1,
    ns: 1,
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
