import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IRoleDefinition extends Document {
  key: string;
  displayName: string;
  description?: string;
  permissions: string[];
  hierarchyLevel: number;
  isBuiltIn: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RoleDefinitionSchema = new Schema<IRoleDefinition>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      maxlength: 80,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    permissions: {
      type: [String],
      required: true,
      default: () => [],
    },
    hierarchyLevel: {
      type: Number,
      required: true,
      min: 0,
      max: 1000000,
      index: true,
    },
    isBuiltIn: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

RoleDefinitionSchema.index({ isBuiltIn: 1, key: 1 });

export const RoleDefinition: Model<IRoleDefinition> = mongoose.model<IRoleDefinition>(
  'RoleDefinition',
  RoleDefinitionSchema
);

