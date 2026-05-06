import mongoose from 'mongoose';

export type ChangeStreamChangeEvent<T = unknown> = {
  operationType?: 'insert' | 'update' | 'replace' | 'delete' | 'invalidate' | 'drop' | 'dropDatabase' | 'rename' | null;
  documentKey?: { _id: mongoose.Types.ObjectId };
  fullDocument?: T;
  updateDescription?: {
    updatedFields?: Record<string, unknown>;
    removedFields?: string[];
  };
};
