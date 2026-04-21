/**
 * Password strength UI segments. Length milestones match progressive feedback;
 * full policy remains `validatePassword` in `src/server/utils/password.ts` (12 chars + classes).
 */

export const PASSWORD_POLICY_MID_LENGTH = 6;
export const PASSWORD_POLICY_MIN_LENGTH = 12;

export interface PasswordStrengthSegment {
  readonly id: string;
  readonly label: string;
  readonly satisfied: boolean;
}

export function getPasswordStrengthSegments(password: string): readonly PasswordStrengthSegment[] {
  const len = password.length;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  return [
    {
      id: 'length6',
      label: `At least ${PASSWORD_POLICY_MID_LENGTH} characters`,
      satisfied: len >= PASSWORD_POLICY_MID_LENGTH,
    },
    {
      id: 'length12',
      label: `At least ${PASSWORD_POLICY_MIN_LENGTH} characters`,
      satisfied: len >= PASSWORD_POLICY_MIN_LENGTH,
    },
    {
      id: 'mixedCase',
      label: 'Upper and lowercase letters',
      satisfied: hasLower && hasUpper,
    },
    {
      id: 'number',
      label: 'One number',
      satisfied: hasNumber,
    },
    {
      id: 'special',
      label: 'One special character',
      satisfied: hasSpecial,
    },
  ];
}

/** How many of the five strength requirements are currently satisfied (0–5). */
export function countPasswordStrengthSatisfied(password: string): number {
  return getPasswordStrengthSegments(password).filter((s) => s.satisfied).length;
}
