import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IList extends Document {
  boardId: mongoose.Types.ObjectId;
  name: string;
  position: number;
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
      maxlength: 100,
    },
    position: {
      type: Number,
      required: true,
      default: 0,
      index: true,
    },
    color: String,
  },
  {
    timestamps: true,
  }
);

ListSchema.index({ boardId: 1, position: 1 });

export const List: Model<IList> = mongoose.model<IList>('List', ListSchema);
