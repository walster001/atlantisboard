import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type ImportJobType = 'trello' | 'wekan' | 'csv' | 'atlantisboard';
export type ImportJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface IImportJobError {
  item: string;
  error: string;
}

export interface IImportResult {
  workspaceId?: mongoose.Types.ObjectId;
  boardId?: mongoose.Types.ObjectId;
  importedCount: number;
  /** Trello (etc.) import summary for client notifications. */
  boardName?: string;
  listCount?: number;
  cardCount?: number;
  labelCount?: number;
}

export interface IImportJob extends Document {
  userId: mongoose.Types.ObjectId;
  type: ImportJobType;
  status: ImportJobStatus;
  progress: number;
  totalItems: number;
  processedItems: number;
  /** Rough import stage for UI (e.g. boards, lists, cards). */
  currentPhase?: string;
  importErrors: IImportJobError[];
  result?: IImportResult;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  expiresAt: Date;
}

const ImportErrorSchema = new Schema<IImportJobError>(
  {
    item: { type: String, required: true },
    error: { type: String, required: true },
  },
  { _id: false }
);

const ImportResultSchema = new Schema<IImportResult>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace' },
    boardId: { type: Schema.Types.ObjectId, ref: 'Board' },
    importedCount: { type: Number, default: 0 },
    boardName: { type: String, maxlength: 512 },
    listCount: { type: Number, min: 0 },
    cardCount: { type: Number, min: 0 },
    labelCount: { type: Number, min: 0 },
  },
  { _id: false }
);

const ImportJobSchema = new Schema<IImportJob>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['trello', 'wekan', 'csv', 'atlantisboard'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    totalItems: {
      type: Number,
      default: 0,
    },
    processedItems: {
      type: Number,
      default: 0,
    },
    currentPhase: {
      type: String,
      trim: true,
      maxlength: 32,
    },
    importErrors: [ImportErrorSchema],
    result: ImportResultSchema,
    completedAt: Date,
    expiresAt: {
      type: Date,
      required: true,
      expires: 0, // TTL index - auto-delete after 2 days
    },
  },
  {
    timestamps: true,
  }
);

ImportJobSchema.index({ userId: 1, status: 1 });

// Set expiresAt to 2 days from creation
ImportJobSchema.pre('save', async function () {
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days
  }
});

export const ImportJob: Model<IImportJob> = mongoose.model<IImportJob>(
  'ImportJob',
  ImportJobSchema
);

