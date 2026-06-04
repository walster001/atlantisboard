import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type NotificationType = 'reminder' | 'assignment' | 'comment' | 'mention' | 'invite';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  relatedCardId?: mongoose.Types.ObjectId;
  relatedBoardId?: mongoose.Types.ObjectId;
  read: boolean;
  readAt?: Date;
  delivered: boolean;
  deliveredAt?: Date;
  createdAt: Date;
  expiresAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['reminder', 'assignment', 'comment', 'mention', 'invite'],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    relatedCardId: {
      type: Schema.Types.ObjectId,
      ref: 'Card',
    },
    relatedBoardId: {
      type: Schema.Types.ObjectId,
      ref: 'Board',
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: Date,
    delivered: {
      type: Boolean,
      default: false,
    },
    deliveredAt: Date,
    expiresAt: {
      type: Date,
      required: true,
      expires: 0, // TTL index - auto-delete after 10 days
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

NotificationSchema.index({ userId: 1, read: 1 });
NotificationSchema.index({ userId: 1, type: 1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });

// Set expiresAt to 10 days from creation
NotificationSchema.pre('save', async function () {
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days
  }
});

export const Notification: Model<INotification> = mongoose.model<INotification>(
  'Notification',
  NotificationSchema
);

