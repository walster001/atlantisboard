import type { IUser } from '../models/User.js';
import type { BoardThemeDefinition } from '../../shared/boardTheme.js';
import { requiresPrivacyPolicyAcceptance } from '../../shared/legal/privacyPolicy.js';

export interface AuthUserPayload {
  id: string;
  email: string;
  username: string;
  displayName: string;
  profilePicture?: string;
  isAppAdmin?: boolean;
  preferences: IUser['preferences'] & { customBoardThemes?: BoardThemeDefinition[] };
  emailVerified: boolean;
  privacyPolicyAcceptedVersion: string | null;
  requiresPrivacyPolicyAcceptance: boolean;
}

export function buildAuthUserPayload(
  user: IUser,
  preferences: AuthUserPayload['preferences'],
): AuthUserPayload {
  const acceptedVersion = user.privacyPolicyAcceptedVersion ?? null;
  const payload: AuthUserPayload = {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    preferences,
    emailVerified: user.emailVerified,
    privacyPolicyAcceptedVersion: acceptedVersion,
    requiresPrivacyPolicyAcceptance: requiresPrivacyPolicyAcceptance(acceptedVersion),
  };
  if (user.profilePicture) {
    payload.profilePicture = user.profilePicture;
  }
  if (user.isAppAdmin) {
    payload.isAppAdmin = true;
  }
  return payload;
}
