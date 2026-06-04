import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IBoardLabel extends Document {
  boardId: mongoose.Types.ObjectId;
  name: string;
  color: string;
  isPredefined: boolean;
  createdAt: Date;
  createdBy: mongoose.Types.ObjectId;
}

const BoardLabelSchema = new Schema<IBoardLabel>(
  {
    boardId: {
      type: Schema.Types.ObjectId,
      ref: 'Board',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    color: {
      type: String,
      required: true,
    },
    isPredefined: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

BoardLabelSchema.index({ boardId: 1, name: 1 });

export const BoardLabel: Model<IBoardLabel> = mongoose.model<IBoardLabel>(
  'BoardLabel',
  BoardLabelSchema
);

