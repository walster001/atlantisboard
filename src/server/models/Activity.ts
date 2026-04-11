import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IActivity extends Document {
  boardId: mongoose.Types.ObjectId;
  cardId?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const ActivitySchema = new Schema<IActivity>(
  {
    boardId: {
      type: Schema.Types.ObjectId,
      ref: 'Board',
      required: true,
    },
    cardId: {
      type: Schema.Types.ObjectId,
      ref: 'Card',
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

ActivitySchema.index({ boardId: 1, createdAt: -1 });
ActivitySchema.index({ boardId: 1, type: 1, createdAt: -1 });
ActivitySchema.index({ cardId: 1, createdAt: -1 });
ActivitySchema.index({ userId: 1, createdAt: -1 });
ActivitySchema.index({ type: 1, createdAt: -1 });

export const Activity: Model<IActivity> = mongoose.model<IActivity>('Activity', ActivitySchema);

