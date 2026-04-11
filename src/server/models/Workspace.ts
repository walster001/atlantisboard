import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type WorkspaceRole = 'admin' | 'manager' | 'viewer';

export interface IWorkspaceMember {
  userId: mongoose.Types.ObjectId;
  roleKey: string;
  joinedAt: Date;
}

export interface IWorkspace extends Document {
  name: string;
  description?: string;
  ownerId: mongoose.Types.ObjectId;
  activityLogRetentionDays?: number;
  createdAt: Date;
  updatedAt: Date;
  members: IWorkspaceMember[];
}

const WorkspaceMemberSchema = new Schema<IWorkspaceMember>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    roleKey: {
      type: String,
      trim: true,
      maxlength: 80,
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    activityLogRetentionDays: {
      type: Number,
      default: 30,
      min: 1,
      max: 365,
    },
    members: [WorkspaceMemberSchema],
  },
  {
    timestamps: true,
  }
);

WorkspaceSchema.set('toJSON', {
  transform(_doc, ret) {
    const plain = ret as unknown as Record<string, unknown>;
    delete plain.visibility;
    delete plain.logo;
  },
});
WorkspaceSchema.set('toObject', {
  transform(_doc, ret) {
    const plain = ret as unknown as Record<string, unknown>;
    delete plain.visibility;
    delete plain.logo;
  },
});

export const Workspace: Model<IWorkspace> = mongoose.model<IWorkspace>(
  'Workspace',
  WorkspaceSchema
);
