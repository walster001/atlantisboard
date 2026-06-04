import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { User } from '../../../models/User.js';
import type { ICard } from '../../../models/Card.js';
import type { TrelloNormalizedCard } from '../../../../shared/import/trelloNormalize.js';

interface ResolveCommentUsersParams {
  readonly cardsToImport: readonly TrelloNormalizedCard[];
  readonly memberMap: ReadonlyMap<string, string>;
  readonly memberIdByEmail: ReadonlyMap<string, string>;
}

export async function resolveCommentUsersByEmail({
  cardsToImport,
  memberMap,
  memberIdByEmail,
}: ResolveCommentUsersParams): Promise<Map<string, mongoose.Types.ObjectId>> {
  const commentEmails = new Set<string>();
  for (const card of cardsToImport) {
    for (const comment of card.comments ?? []) {
      const email = comment.memberCreator.email;
      if (typeof email === 'string' && email.trim().length > 0) {
        commentEmails.add(email.trim());
      }
    }
  }

  const commentUserByEmail = new Map<string, mongoose.Types.ObjectId>();
  await Promise.all(
    [...commentEmails].map(async (email) => {
      const sourceMemberId = memberIdByEmail.get(email);
      const mappedMemberUserId = sourceMemberId != null ? memberMap.get(sourceMemberId) : undefined;
      if (mappedMemberUserId) {
        commentUserByEmail.set(email, new mongoose.Types.ObjectId(mappedMemberUserId));
        return;
      }
      const user = await User.findOne({ email: { $eq: email } });
      if (user?._id) {
        commentUserByEmail.set(email, user._id as mongoose.Types.ObjectId);
      }
    }),
  );

  return commentUserByEmail;
}

export function buildCardComments(
  trelloCard: TrelloNormalizedCard,
  commentUserByEmail: ReadonlyMap<string, mongoose.Types.ObjectId>,
  userId: string,
): ICard['comments'] {
  return (trelloCard.comments ?? []).map((comment) => {
    const email = comment.memberCreator.email?.trim();
    const commentUserId =
      email != null && email.length > 0
        ? (commentUserByEmail.get(email) ?? new mongoose.Types.ObjectId(userId))
        : new mongoose.Types.ObjectId(userId);
    return {
      id: crypto.randomUUID(),
      userId: commentUserId,
      text: comment.data.text,
      createdAt: new Date(comment.date),
      updatedAt: new Date(comment.date),
    };
  });
}
