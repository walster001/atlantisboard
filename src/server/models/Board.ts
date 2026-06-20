import mongoose, { Schema, type Document, type Model } from 'mongoose';
import {
  BOARD_DESCRIPTION_MAX_LENGTH,
  BOARD_NAME_MAX_LENGTH,
} from '../../shared/constants/entityTextLimits.js';
import type { BoardThemeSettings, BoardThemeSettingsStored } from '../../shared/boardTheme.js';
import type { BoardActivityTrackingSettings } from '../../shared/constants/boardContentActivities.js';

export type BoardVisibility = 'private' | 'workspace' | 'public';
export type BoardRole = 'admin' | 'manager' | 'viewer';

export interface IBoardMember {
  userId: mongoose.Types.ObjectId;
  /** Granular permissions role key. For built-ins, equals admin|manager|viewer. */
  roleKey: string;
  addedAt: Date;
}

export interface IBoardSettings {
  allowComments: boolean;
  allowAttachments: boolean;
  cardCoverImages: boolean;
  /** Legacy bundled flag; retained for older documents. Reminder visibility prefers `showRemindersOnCards`. */
  showDueDateAndReminders: boolean;
  /** When unset, `boardShowsRemindersOnCards` falls back to `showDueDateAndReminders`. */
  showRemindersOnCards?: boolean;
  showStartDateOnCards?: boolean;
  showDueDateOnCards?: boolean;
  showEndDateOnCards?: boolean;
  showLabels: boolean;
  showAssignees: boolean;
  showChecklist: boolean;
  showAttachments: boolean;
  showComments: boolean;
  /** When true (default), each list header shows the card count. */
  showListCardCount: boolean;
  showCardDescriptionPreview: boolean;
  /** Board-wide max cards per list (default 1000 when unset). */
  listMaxCards?: number;
  /** When true, block adds past limit; when false, soft limit (client may warn). */
  listEnforceMaxCards?: boolean;
  /** Default true when unset: responsive column width. False = fixed listColumnWidthPx. */
  listColumnWidthAuto?: boolean;
  /** Fixed column width in px when listColumnWidthAuto is false. */
  listColumnWidthPx?: number;
  /** When set, member activity log entries older than this many days may be purged; `null` = never expire. */
  memberActivityLogRetentionDays?: number | null;
  /** When true, board content activities are recorded per category toggles. Default false (opt-in). */
  activityLogEnabled?: boolean;
  /** When set, board content activity rows older than this many days may be purged; `null` = never expire. */
  activityLogRetentionDays?: number | null;
  /** Per-category tracking toggles for board content activities. */
  activityLogTracking?: BoardActivityTrackingSettings;
  /** When true, configured recipients receive a weekly board content activity email roundup. */
  activityLogEmailRoundupEnabled?: boolean;
  /** Board member user IDs that receive the weekly activity roundup email. */
  activityLogEmailRoundupUserIds?: mongoose.Types.ObjectId[];
}

export interface IBoard extends Document {
  workspaceId?: mongoose.Types.ObjectId;
  /** Order on the home page within the same workspace (or personal bucket when workspaceId is unset). */
  position: number;
  name: string;
  description?: string;
  background?: string;
  themeSettings?: BoardThemeSettings | BoardThemeSettingsStored;
  visibility: BoardVisibility;
  ownerId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  members: IBoardMember[];
  settings: IBoardSettings;
}

const BoardMemberSchema = new Schema<IBoardMember>(
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
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const BoardSettingsSchema = new Schema<IBoardSettings>(
  {
    allowComments: { type: Boolean, default: true },
    allowAttachments: { type: Boolean, default: true },
    cardCoverImages: { type: Boolean, default: true },
    showDueDateAndReminders: { type: Boolean, default: true },
    showRemindersOnCards: { type: Boolean, default: true },
    showStartDateOnCards: { type: Boolean, default: true },
    showDueDateOnCards: { type: Boolean, default: true },
    showEndDateOnCards: { type: Boolean, default: true },
    showLabels: { type: Boolean, default: true },
    showAssignees: { type: Boolean, default: true },
    showChecklist: { type: Boolean, default: true },
    showAttachments: { type: Boolean, default: true },
    showComments: { type: Boolean, default: true },
    showListCardCount: { type: Boolean, default: true },
    showCardDescriptionPreview: { type: Boolean, default: true },
    listMaxCards: { type: Number, min: 1 },
    listEnforceMaxCards: { type: Boolean, default: true },
    listColumnWidthAuto: { type: Boolean, default: true },
    listColumnWidthPx: { type: Number, min: 140, max: 800 },
    memberActivityLogRetentionDays: { type: Schema.Types.Mixed, default: undefined },
    activityLogEnabled: { type: Boolean, default: false },
    activityLogRetentionDays: { type: Schema.Types.Mixed, default: undefined },
    activityLogTracking: {
      lists: { type: Boolean },
      cards: { type: Boolean },
      cardDescriptions: { type: Boolean },
      checklists: { type: Boolean },
      attachments: { type: Boolean },
      labels: { type: Boolean },
      comments: { type: Boolean },
      assignees: { type: Boolean },
      reminders: { type: Boolean },
      dates: { type: Boolean },
    },
    activityLogEmailRoundupEnabled: { type: Boolean, default: false },
    activityLogEmailRoundupUserIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { _id: false }
);

const BoardSchema = new Schema<IBoard>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      index: true,
    },
    position: {
      type: Number,
      default: 0,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: BOARD_NAME_MAX_LENGTH,
    },
    description: {
      type: String,
      trim: true,
      maxlength: BOARD_DESCRIPTION_MAX_LENGTH,
    },
    background: String,
    themeSettings: {
      type: Schema.Types.Mixed,
      required: false,
    },
    visibility: {
      type: String,
      enum: ['private', 'workspace', 'public'],
      default: 'private',
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    members: [BoardMemberSchema],
    settings: {
      type: BoardSettingsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

BoardSchema.index({ workspaceId: 1, position: 1 });
BoardSchema.index({ ownerId: 1, position: 1 });
BoardSchema.index({ 'members.userId': 1 });
BoardSchema.index(
  { 'settings.activityLogEmailRoundupEnabled': 1 },
  {
    partialFilterExpression: {
      'settings.activityLogEmailRoundupEnabled': true,
      'settings.activityLogEmailRoundupUserIds.0': { $exists: true },
    },
    name: 'board_activity_roundup_enabled',
  },
);

export const Board: Model<IBoard> = mongoose.model<IBoard>('Board', BoardSchema);

