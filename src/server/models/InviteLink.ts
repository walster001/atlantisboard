import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type InviteType = 'workspace' | 'board';
export type InviteLinkType = 'one-time' | 'recurring';

export interface IInviteLink extends Document {
  workspaceId?: mongoose.Types.ObjectId;
  boardId?: mongoose.Types.ObjectId;
  token: string;
  type: InviteType;
  inviteType: InviteLinkType;
  /** Granular permissions role key. For built-ins, equals admin|manager|viewer. */
  roleKey: string;
  expiresAt?: Date;
  maxUses?: number;
  usedCount: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  lastUsedAt?: Date;
}

const InviteLinkSchema = new Schema<IInviteLink>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
    },
    boardId: {
      type: Schema.Types.ObjectId,
      ref: 'Board',
    },
    token: {
      type: String,
      required: true,
      unique: true,
      length: 32,
    },
    type: {
      type: String,
      enum: ['workspace', 'board'],
      required: true,
    },
    inviteType: {
      type: String,
      enum: ['one-time', 'recurring'],
      required: true,
    },
    roleKey: {
      type: String,
      trim: true,
      maxlength: 80,
      required: true,
    },
    expiresAt: {
      type: Date,
    },
    maxUses: Number,
    usedCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastUsedAt: Date,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

InviteLinkSchema.index({ workspaceId: 1 });
InviteLinkSchema.index({ boardId: 1 });
InviteLinkSchema.index({ expiresAt: 1 });

export const InviteLink: Model<IInviteLink> = mongoose.model<IInviteLink>(
  'InviteLink',
  InviteLinkSchema
);

