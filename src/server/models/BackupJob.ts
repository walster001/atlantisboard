import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type BackupJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type BackupJobKind = 'backup' | 'restore';

export interface IBackupJobResult {
  folderId: string;
  filePath: string;
  sizeBytes: number;
  prunedCount: number;
}

export interface IBackupJob extends Document {
  userId: mongoose.Types.ObjectId;
  jobKind: BackupJobKind;
  sourceFolderId?: string;
  status: BackupJobStatus;
  progress: number;
  totalItems: number;
  processedItems: number;
  currentPhase?: string;
  failureMessage?: string;
  result?: IBackupJobResult;
  filename: string;
  location: string;
  cancelRequestedAt?: Date;
  startedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  expiresAt: Date;
}

const BackupJobResultSchema = new Schema<IBackupJobResult>(
  {
    folderId: { type: String, required: true },
    filePath: { type: String, required: true },
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
    jobKind: {
      type: String,
      enum: ['backup', 'restore'],
      default: 'backup',
      index: true,
    },
    sourceFolderId: { type: String, trim: true, maxlength: 240 },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    totalItems: { type: Number, default: 5, min: 1 },
    processedItems: { type: Number, default: 0, min: 0 },
    currentPhase: { type: String, trim: true, maxlength: 64 },
    failureMessage: { type: String, trim: true, maxlength: 4000 },
    result: { type: BackupJobResultSchema, required: false },
    filename: { type: String, required: true, trim: true, maxlength: 240 },
    location: { type: String, required: true, trim: true, maxlength: 1200 },
    cancelRequestedAt: Date,
    startedAt: Date,
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
BackupJobSchema.index({ userId: 1, jobKind: 1, status: 1 });

BackupJobSchema.pre('save', async function () {
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  }
});

export const BackupJob: Model<IBackupJob> = mongoose.model<IBackupJob>('BackupJob', BackupJobSchema);
