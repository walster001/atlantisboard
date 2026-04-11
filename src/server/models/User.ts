import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IUser extends Document {
  email: string;
  username: string;
  passwordHash?: string;
  googleId?: string;
  profilePicture?: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    notifications: boolean;
    language: string;
    notificationPreferences: {
      reminders: {
        inApp: boolean;
        push: boolean;
        sms: boolean;
      };
      assignments: {
        inApp: boolean;
        push: boolean;
      };
      comments: {
        inApp: boolean;
        push: boolean;
      };
      mentions: {
        inApp: boolean;
        push: boolean;
      };
      invites: {
        inApp: boolean;
        push: boolean;
      };
    };
    /** Per-user boards homepage workspace row order (visible workspace ids only). */
    homeWorkspaceOrder?: string[];
  };
  emailVerified: boolean;
  verificationToken?: string;
  isPlaceholder?: boolean;
  placeholderSource?: 'trello' | 'wekan';
  placeholderEmail?: string;
  placeholderName?: string;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  isAppAdmin: boolean;
  /** True only for the first account promoted to App Admin at install (cannot revoke own App Admin). */
  foundingAppAdmin: boolean;
  pushSubscription?: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
}

const NotificationPreferencesSchema = new Schema(
  {
    reminders: {
      inApp: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
    },
    assignments: {
      inApp: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
    comments: {
      inApp: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
    mentions: {
      inApp: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
    invites: {
      inApp: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
  },
  { _id: false }
);

const PreferencesSchema = new Schema(
  {
    theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'light' },
    notifications: { type: Boolean, default: true },
    language: { type: String, default: 'en' },
    notificationPreferences: { type: NotificationPreferencesSchema, default: () => ({}) },
    homeWorkspaceOrder: { type: [String], default: undefined },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      validate: {
        validator: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'Invalid email format',
      },
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
      minlength: 3,
      maxlength: 50,
    },
    passwordHash: {
      type: String,
      required: false,
      select: false,
    },
    googleId: {
      type: String,
      sparse: true,
      unique: true,
      index: true,
    },
    profilePicture: String,
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    lastLogin: Date,
    preferences: {
      type: PreferencesSchema,
      default: () => ({}),
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    isPlaceholder: {
      type: Boolean,
      default: false,
    },
    placeholderSource: {
      type: String,
      enum: ['trello', 'wekan'],
    },
    placeholderEmail: String,
    placeholderName: String,
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: Date,
    isAppAdmin: {
      type: Boolean,
      default: false,
      index: true,
    },
    foundingAppAdmin: {
      type: Boolean,
      default: false,
      index: true,
    },
    pushSubscription: {
      endpoint: String,
      keys: {
        p256dh: String,
        auth: String,
      },
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Full-text search for user directory / member pickers. One text index per collection (MongoDB rule).
 * Weights favor display name, then username, then email.
 */
UserSchema.index(
  { displayName: 'text', email: 'text', username: 'text' },
  {
    weights: { displayName: 10, username: 5, email: 3 },
    name: 'user_directory_text',
  }
);

export const User: Model<IUser> = mongoose.model<IUser>('User', UserSchema);

