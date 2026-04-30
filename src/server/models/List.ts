import mongoose, { Schema, type Document, type Model } from 'mongoose';
import { LIST_NAME_MAX_LENGTH } from '../../shared/constants/entityTextLimits.js';

export interface IList extends Document {
  boardId: mongoose.Types.ObjectId;
  name: string;
  position: number;
  pos?: number;
  createdAt: Date;
  updatedAt: Date;
  color?: string;
}

const ListSchema = new Schema<IList>(
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
      maxlength: LIST_NAME_MAX_LENGTH,
    },
    position: {
      type: Number,
      required: true,
      default: 0,
      index: true,
    },
    pos: {
      type: Number,
      required: false,
      index: true,
    },
    color: String,
  },
  {
    timestamps: true,
  }
);

ListSchema.index({ boardId: 1, pos: 1, position: 1 });

export const List: Model<IList> = mongoose.model<IList>('List', ListSchema);
