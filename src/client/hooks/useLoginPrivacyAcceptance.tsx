import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { PrivacyPolicyAcceptanceCard } from '../components/auth/PrivacyPolicyAcceptanceCard.js';

interface AuthUserPrivacyFields {
  readonly requiresPrivacyPolicyAcceptance?: boolean;
}

interface UseLoginPrivacyAcceptanceOptions {
  readonly authenticated: boolean;
  readonly requiresPrivacyPolicyAcceptance: boolean;
  readonly acceptPrivacyPolicy: () => Promise<void>;
  readonly onAccepted: () => void;
  readonly privacyQueryParam: string | null;
}

interface UseLoginPrivacyAcceptanceResult {
  readonly requirePrivacyAcceptanceIfNeeded: (
    user: AuthUserPrivacyFields | null | undefined,
  ) => boolean;
  readonly privacyAcceptanceView: ReactElement | null;
}

export function useLoginPrivacyAcceptance({
  authenticated,
  requiresPrivacyPolicyAcceptance,
  acceptPrivacyPolicy,
  onAccepted,
  privacyQueryParam,
}: UseLoginPrivacyAcceptanceOptions): UseLoginPrivacyAcceptanceResult {
  const [pendingPrivacyAcceptance, setPendingPrivacyAcceptance] = useState(false);

  const requirePrivacyAcceptanceIfNeeded = useCallback(
    (user: AuthUserPrivacyFields | null | undefined): boolean => {
      if (!user?.requiresPrivacyPolicyAcceptance) {
        return false;
      }
      setPendingPrivacyAcceptance(true);
      return true;
    },
    [],
  );

  const handlePrivacyAccepted = useCallback(async (): Promise<void> => {
    await acceptPrivacyPolicy();
    setPendingPrivacyAcceptance(false);
    onAccepted();
  }, [acceptPrivacyPolicy, onAccepted]);

  useEffect(() => {
    if (privacyQueryParam === '1' && authenticated && requiresPrivacyPolicyAcceptance) {
      setPendingPrivacyAcceptance(true);
    }
  }, [privacyQueryParam, authenticated, requiresPrivacyPolicyAcceptance]);

  const privacyAcceptanceView = pendingPrivacyAcceptance ? (
    <PrivacyPolicyAcceptanceCard onAccept={handlePrivacyAccepted} />
  ) : null;

  return {
    requirePrivacyAcceptanceIfNeeded,
    privacyAcceptanceView,
  };
}
