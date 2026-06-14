import mongoose from 'mongoose';
import { assertMongoDbDiskReserve } from '../utils/diskSpaceGuard.js';

let registered = false;

export function registerMongoDiskGuardPlugin(): void {
  if (registered) {
    return;
  }
  registered = true;

  const guard = async function mongoDiskReserveGuard(): Promise<void> {
    await assertMongoDbDiskReserve();
  };

  const queryWriteHooks = [
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'replaceOne',
    'findOneAndUpdate',
    'findOneAndReplace',
    'findOneAndDelete',
  ] as const;

  mongoose.plugin((schema) => {
    schema.pre('save', guard);
    for (const hook of queryWriteHooks) {
      schema.pre(hook, guard);
    }
  });
}

registerMongoDiskGuardPlugin();
