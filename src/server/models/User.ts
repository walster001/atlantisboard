import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { BoardThemeDefinition } from '../../shared/boardTheme.js';

export interface IUser extends Document {
  email: string;
  username: string;
  passwordHash?: string;
  googleId?: string;
  googleProfilePicture?: string;
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
    /** App-wide custom board themes for this user (used by create-board + board settings). */
    customBoardThemes?: BoardThemeDefinition[];
  };
  emailVerified: boolean;
  verificationToken?: string;
  isPlaceholder?: boolean;
  placeholderSource?: 'trello' | 'wekan';
  placeholderEmail?: string;
  placeholderName?: string;
  /** Original import file username (login matching for board import placeholders). */
  placeholderImportUsername?: string;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  isAppAdmin: boolean;
  /** True only for the first account promoted to App Admin at install (cannot revoke own App Admin). */
  foundingAppAdmin: boolean;
  /** Account-wide capabilities (e.g. homepage import, create workspace) managed in Admin → Users. */
  accountCapabilities?: string[];
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

const BoardThemePaletteSchema = new Schema(
  {
    navbarBg: { type: String, required: true },
    navbarBorder: { type: String, required: true },
    canvasBg: { type: String, required: true },
    listBg: { type: String, required: true },
    listHeaderText: { type: String, required: true },
    listMuted: { type: String, required: true },
    listMutedStrong: { type: String, required: true },
    listControlHoverBg: { type: String, required: true },
    listShadow: { type: String, required: true },
    addListBg: { type: String, required: true },
    addListBgHover: { type: String, required: true },
    cardDetailBg: { type: String, required: true },
    cardDetailTitleText: { type: String, required: true },
    cardDetailText: { type: String, required: true },
    cardDetailButtonBg: { type: String, required: true },
    cardDetailButtonText: { type: String, required: true },
    cardDetailButtonHoverBg: { type: String, required: true },
    cardDetailButtonHoverText: { type: String, required: true },
    scrollbarColor: { type: String, required: true },
    scrollbarTrackColor: { type: String, required: true },
  },
  { _id: false }
);

const BoardThemeDefinitionSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    palette: { type: BoardThemePaletteSchema, required: true },
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
    customBoardThemes: { type: [BoardThemeDefinitionSchema], default: undefined },
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
    googleProfilePicture: String,
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
    placeholderImportUsername: String,
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
    accountCapabilities: {
      type: [String],
      default: () => [],
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

