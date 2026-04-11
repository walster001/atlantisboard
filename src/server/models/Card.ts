import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface ICardLabel {
  id: string;
  name: string;
  color: string;
}

export interface ICardReminder {
  id: string;
  triggerAt: Date;
  repeatFrequency?: string;
  sent: boolean;
  sentAt?: Date;
  dismissed: boolean;
}

export interface ICardAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  uploadedAt: Date;
  uploadedBy: mongoose.Types.ObjectId;
}

export interface ICardComment {
  id: string;
  userId: mongoose.Types.ObjectId;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: Date;
  sortOrder?: number;
}

export interface IChecklist {
  id: string;
  title: string;
  items: IChecklistItem[];
}

export interface ICard extends Document {
  listId: mongoose.Types.ObjectId;
  boardId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  descriptionHtml?: string;
  descriptionPreview: string;
  descriptionCharCount: number;
  position: number;
  color?: string;
  cover?: string;
  labels: ICardLabel[];
  dueDate?: Date;
  startDate?: Date;
  completed: boolean;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: mongoose.Types.ObjectId;
  assignees: mongoose.Types.ObjectId[];
  reminders: ICardReminder[];
  attachments: ICardAttachment[];
  comments: ICardComment[];
  checklists: IChecklist[];
}

const CardLabelSchema = new Schema<ICardLabel>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    color: { type: String, required: true },
  },
  { _id: false }
);

const CardReminderSchema = new Schema<ICardReminder>(
  {
    id: { type: String, required: true },
    triggerAt: { type: Date, required: true },
    repeatFrequency: String,
    sent: { type: Boolean, default: false },
    sentAt: Date,
    dismissed: { type: Boolean, default: false },
  },
  { _id: false }
);

const CardAttachmentSchema = new Schema<ICardAttachment>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { _id: false }
);

const CardCommentSchema = new Schema<ICardComment>(
  {
    id: { type: String, required: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ChecklistItemSchema = new Schema<IChecklistItem>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    completed: { type: Boolean, default: false },
    completedAt: Date,
    sortOrder: Number,
  },
  { _id: false }
);

const ChecklistSchema = new Schema<IChecklist>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    items: [ChecklistItemSchema],
  },
  { _id: false }
);

const CardSchema = new Schema<ICard>(
  {
    listId: {
      type: Schema.Types.ObjectId,
      ref: 'List',
      required: true,
      index: true,
    },
    boardId: {
      type: Schema.Types.ObjectId,
      ref: 'Board',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      maxlength: 100_000,
    },
    descriptionHtml: {
      type: String,
      default: '',
      maxlength: 400_000,
    },
    descriptionPreview: {
      type: String,
      default: '',
      maxlength: 2_000,
    },
    descriptionCharCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    position: {
      type: Number,
      required: true,
      default: 0,
      index: true,
    },
    color: String,
    cover: String,
    labels: [CardLabelSchema],
    dueDate: {
      type: Date,
      index: true,
    },
    startDate: Date,
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: Date,
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignees: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    reminders: [CardReminderSchema],
    attachments: [CardAttachmentSchema],
    comments: [CardCommentSchema],
    checklists: [ChecklistSchema],
  },
  {
    timestamps: true,
  }
);

CardSchema.index({ listId: 1, position: 1 });
CardSchema.index({ boardId: 1, dueDate: 1 });
CardSchema.index({ createdBy: 1 });
CardSchema.index({ assignees: 1 });

export const Card: Model<ICard> = mongoose.model<ICard>('Card', CardSchema);

