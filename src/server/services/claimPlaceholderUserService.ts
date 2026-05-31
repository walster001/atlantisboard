import type { HydratedDocument } from 'mongoose';
import type { IUser } from '../models/User.js';

export interface ClaimPlaceholderAsRealUserParams {
  readonly emailNorm: string;
  readonly username: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly isFirstUser: boolean;
}

/** Converts a placeholder user document into a real account (registration / OAuth claim). */
export async function claimPlaceholderAsRealUser(
  placeholderUser: HydratedDocument<IUser>,
  params: ClaimPlaceholderAsRealUserParams,
): Promise<HydratedDocument<IUser>> {
  placeholderUser.isPlaceholder = false;
  placeholderUser.email = params.emailNorm;
  placeholderUser.username = params.username;
  placeholderUser.passwordHash = params.passwordHash;
  placeholderUser.displayName = params.displayName;
  placeholderUser.emailVerified = false;
  placeholderUser.failedLoginAttempts = 0;
  placeholderUser.set('placeholderSource', undefined, { strict: false });
  placeholderUser.set('placeholderEmail', undefined, { strict: false });
  placeholderUser.set('placeholderName', undefined, { strict: false });
  placeholderUser.set('placeholderImportUsername', undefined, { strict: false });
  if (params.isFirstUser) {
    placeholderUser.isAppAdmin = true;
    placeholderUser.foundingAppAdmin = true;
  }
  await placeholderUser.save();
  return placeholderUser;
}
