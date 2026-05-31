import { z } from 'zod';
import mongoose from 'mongoose';
import { getBoardById } from '../../services/boardService.js';

export const pushSubscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

export const updateUserProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
});

export const updatePreferencesSchema = z
  .object({
    language: z.string().min(2).max(20).optional(),
    homeWorkspaceOrder: z.array(z.string().min(1)).max(500).optional(),
    homeBoardOrderPatch: z
      .object({
        workspaceId: z.string().min(1).max(128),
        orderedBoardIds: z.array(z.string().min(1)).max(500),
      })
      .optional(),
    customBoardThemes: z
      .array(
        z.object({
          id: z.string().min(1).max(80),
          name: z.string().min(1).max(80),
          palette: z.object({
            navbarBg: z.string().min(1),
            navbarBorder: z.string().min(1),
            canvasBg: z.string().min(1),
            listBg: z.string().min(1),
            listHeaderText: z.string().min(1),
            listMuted: z.string().min(1),
            listMutedStrong: z.string().min(1),
            listControlHoverBg: z.string().min(1),
            listShadow: z.string().min(1),
            addListBg: z.string().min(1),
            addListBgHover: z.string().min(1),
            cardDetailBg: z.string().min(1),
            cardDetailTitleText: z.string().min(1),
            cardDetailText: z.string().min(1),
            cardDetailButtonBg: z.string().min(1),
            cardDetailButtonText: z.string().min(1),
            cardDetailButtonHoverBg: z.string().min(1),
            cardDetailButtonHoverText: z.string().min(1),
            scrollbarColor: z.string().min(1),
            scrollbarTrackColor: z.string().min(1),
          }),
        }),
      )
      .max(250)
      .optional(),
  })
  .strict();

export function collectBoardOccupantUserIds(
  board: NonNullable<Awaited<ReturnType<typeof getBoardById>>>,
): string[] {
  const ids: string[] = [];
  const owner = board.ownerId as unknown;
  if (owner && typeof owner === 'object' && owner !== null && '_id' in owner) {
    ids.push(String((owner as { _id: mongoose.Types.ObjectId })._id));
  } else {
    ids.push(String(owner));
  }
  for (const m of board.members) {
    const u = m.userId as unknown;
    if (u && typeof u === 'object' && u !== null && '_id' in u) {
      ids.push(String((u as { _id: mongoose.Types.ObjectId })._id));
    } else {
      ids.push(String(u));
    }
  }
  return ids;
}
