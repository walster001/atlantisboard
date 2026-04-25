import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type BackupJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface IBackupJobResult {
  folderId: string;
  objectKey: string;
  sizeBytes: number;
  prunedCount: number;
}

export interface IBackupJob extends Document {
  userId: mongoose.Types.ObjectId;
  status: BackupJobStatus;
  progress: number;
  totalItems: number;
  processedItems: number;
  currentPhase?: string;
  failureMessage?: string;
  result?: IBackupJobResult;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  expiresAt: Date;
}

const BackupJobResultSchema = new Schema<IBackupJobResult>(
  {
    folderId: { type: String, required: true },
    objectKey: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    prunedCount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const BackupJobSchema = new Schema<IBackupJob>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    totalItems: { type: Number, default: 5, min: 1 },
    processedItems: { type: Number, default: 0, min: 0 },
    currentPhase: { type: String, trim: true, maxlength: 64 },
    failureMessage: { type: String, trim: true, maxlength: 4000 },
    result: { type: BackupJobResultSchema, required: false },
    completedAt: Date,
    expiresAt: {
      type: Date,
      required: true,
      expires: 0,
    },
  },
  { timestamps: true }
);

BackupJobSchema.index({ userId: 1, status: 1 });

BackupJobSchema.pre('save', async function () {
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  }
});

export const BackupJob: Model<IBackupJob> = mongoose.model<IBackupJob>('BackupJob', BackupJobSchema);
