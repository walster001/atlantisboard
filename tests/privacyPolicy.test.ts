import { expect, it } from 'bun:test';
import {
  PRIVACY_POLICY_VERSION,
  requiresPrivacyPolicyAcceptance,
} from '../src/shared/legal/privacyPolicy.js';

it('requires acceptance when version is missing or outdated', () => {
  expect(requiresPrivacyPolicyAcceptance(undefined)).toBe(true);
  expect(requiresPrivacyPolicyAcceptance(null)).toBe(true);
  expect(requiresPrivacyPolicyAcceptance('2020-01-01')).toBe(true);
});

it('does not require acceptance when current version is stored', () => {
  expect(requiresPrivacyPolicyAcceptance(PRIVACY_POLICY_VERSION)).toBe(false);
});
