import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import type { BoardThemePalette } from '../../shared/boardTheme.js';

export type BoardThemeScope = 'system' | 'user';

export interface IBoardTheme extends Document {
  slug: string;
  name: string;
  palette: BoardThemePalette;
  scope: BoardThemeScope;
  ownerUserId?: Types.ObjectId;
  prefersNavbarLightForeground: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const BoardThemePaletteSchema = new Schema<BoardThemePalette>(
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
  { _id: false },
);

const BoardThemeSchema = new Schema<IBoardTheme>(
  {
    slug: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    palette: { type: BoardThemePaletteSchema, required: true },
    scope: { type: String, enum: ['system', 'user'], required: true, index: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    prefersNavbarLightForeground: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'themes' },
);

BoardThemeSchema.index(
  { scope: 1, slug: 1 },
  { unique: true, partialFilterExpression: { scope: 'system' } },
);
BoardThemeSchema.index(
  { scope: 1, ownerUserId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { scope: 'user' } },
);
BoardThemeSchema.index({ scope: 1, sortOrder: 1, slug: 1 });

export const BoardTheme: Model<IBoardTheme> = mongoose.model<IBoardTheme>('BoardTheme', BoardThemeSchema);
