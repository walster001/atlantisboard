/** Bundled privacy notice version — bump when `public/legal/privacy-policy.md` changes materially. */
export const PRIVACY_POLICY_VERSION = '2026-05-31';

export function requiresPrivacyPolicyAcceptance(
  acceptedVersion: string | null | undefined,
): boolean {
  return acceptedVersion !== PRIVACY_POLICY_VERSION;
}
