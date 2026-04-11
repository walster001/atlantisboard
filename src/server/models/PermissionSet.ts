import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IPermissionSet extends Document {
  name: string;
  description?: string;
  permissions: string[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PermissionSetSchema = new Schema<IPermissionSet>(
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
    permissions: {
      type: [String],
      required: true,
      default: [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

PermissionSetSchema.index({ createdBy: 1 });
PermissionSetSchema.index({ name: 1 });

export const PermissionSet: Model<IPermissionSet> = mongoose.model<IPermissionSet>(
  'PermissionSet',
  PermissionSetSchema
);

