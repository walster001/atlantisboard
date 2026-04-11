/**
 * Password policy checks aligned with server `validatePassword` in `src/server/utils/password.ts`.
 */

export const PASSWORD_POLICY_MIN_LENGTH = 12;

export interface PasswordStrengthSegment {
  readonly id: string;
  readonly label: string;
  readonly satisfied: boolean;
}

export function getPasswordStrengthSegments(password: string): readonly PasswordStrengthSegment[] {
  return [
    {
      id: 'length',
      label: `At least ${PASSWORD_POLICY_MIN_LENGTH} characters`,
      satisfied: password.length >= PASSWORD_POLICY_MIN_LENGTH,
    },
    {
      id: 'lower',
      label: 'One lowercase letter',
      satisfied: /[a-z]/.test(password),
    },
    {
      id: 'upper',
      label: 'One uppercase letter',
      satisfied: /[A-Z]/.test(password),
    },
    {
      id: 'number',
      label: 'One number',
      satisfied: /[0-9]/.test(password),
    },
    {
      id: 'special',
      label: 'One special character',
      satisfied: /[^a-zA-Z0-9]/.test(password),
    },
  ];
}

export function countPasswordStrengthSatisfied(password: string): number {
  return getPasswordStrengthSegments(password).filter((s) => s.satisfied).length;
}
