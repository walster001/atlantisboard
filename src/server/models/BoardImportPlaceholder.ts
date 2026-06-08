import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IBoardImportPlaceholder extends Document {
  boardId: mongoose.Types.ObjectId;
  source: 'trello' | 'wekan';
  sourceUserId: string;
  displayName: string;
  email?: string;
  importUsername?: string;
  roleKey: string;
  /** Role assigned at import; unchanged when admins adjust {@link roleKey} before claim. */
  importedRoleKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BoardImportPlaceholderSchema = new Schema<IBoardImportPlaceholder>(
  {
    boardId: {
      type: Schema.Types.ObjectId,
      ref: 'Board',
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['trello', 'wekan'],
      required: true,
    },
    sourceUserId: {
      type: String,
      required: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    importUsername: {
      type: String,
      trim: true,
      lowercase: true,
    },
    roleKey: {
      type: String,
      required: true,
      trim: true,
    },
    importedRoleKey: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

BoardImportPlaceholderSchema.index({ boardId: 1, sourceUserId: 1 }, { unique: true });
BoardImportPlaceholderSchema.index({ boardId: 1, displayName: 1 });
BoardImportPlaceholderSchema.index({ email: 1 });
BoardImportPlaceholderSchema.index({ importUsername: 1 });

export const BoardImportPlaceholder: Model<IBoardImportPlaceholder> = mongoose.model<IBoardImportPlaceholder>(
  'BoardImportPlaceholder',
  BoardImportPlaceholderSchema,
);
