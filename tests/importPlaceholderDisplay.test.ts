import { describe, expect, test } from 'bun:test';
import {
  displayEmailForImportPlaceholderUser,
  isSyntheticImportPlaceholderEmail,
} from '../src/shared/import/importPlaceholderDisplay.js';

describe('importPlaceholderDisplay', () => {
  test('detects synthetic placeholder account emails', () => {
    expect(isSyntheticImportPlaceholderEmail('import+wekan+abc@placeholder.import.local')).toBe(true);
    expect(isSyntheticImportPlaceholderEmail('user@example.com')).toBe(false);
  });

  test('prefers import file email over synthetic account email', () => {
    expect(
      displayEmailForImportPlaceholderUser({
        placeholderEmail: 'amelia@company.com',
        accountEmail: 'import+wekan+abc@placeholder.import.local',
      }),
    ).toBe('amelia@company.com');
  });

  test('hides synthetic email stored on placeholderEmail field', () => {
    expect(
      displayEmailForImportPlaceholderUser({
        placeholderEmail: 'import+wekan+abc@placeholder.import.local',
        accountEmail: 'other@example.com',
      }),
    ).toBe('other@example.com');
  });

  test('hides synthetic account email when import file had no email', () => {
    expect(
      displayEmailForImportPlaceholderUser({
        accountEmail: 'import+wekan+abc@placeholder.import.local',
      }),
    ).toBe('');
  });
});
