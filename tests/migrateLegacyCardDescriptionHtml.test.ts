import { describe, expect, test } from 'bun:test';
import {
  descriptionJsonNeedsHtmlMigration,
  migrateLegacyDescriptionHtmlToJson,
  tryMigrateCardDescriptionFields,
} from '../src/server/utils/migrateLegacyCardDescriptionHtml.js';

describe('migrateLegacyCardDescriptionHtml', () => {
  test('descriptionJsonNeedsHtmlMigration is true for empty JSON', () => {
    expect(descriptionJsonNeedsHtmlMigration('')).toBe(true);
    expect(descriptionJsonNeedsHtmlMigration(undefined)).toBe(true);
  });

  test('migrateLegacyDescriptionHtmlToJson strips scripts and produces JSON', () => {
    const json = migrateLegacyDescriptionHtmlToJson(
      '<p>Hello <strong>world</strong></p><img onerror="alert(1)" src=x>',
    );
    expect(json).not.toBeNull();
    const parsed = JSON.parse(json ?? '{}') as { type?: string };
    expect(parsed.type).toBe('doc');
    expect(json).not.toContain('onerror');
  });

  test('tryMigrateCardDescriptionFields returns migrated description and clears HTML flag', () => {
    const result = tryMigrateCardDescriptionFields({
      description: '',
      descriptionHtml: '<p>Legacy note</p>',
    });
    expect(result).not.toBeNull();
    expect(result?.clearDescriptionHtml).toBe(true);
    expect(result?.description).toContain('"type":"doc"');
  });

  test('tryMigrateCardDescriptionFields skips when JSON already has content', () => {
    const existing = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Already migrated' }] }],
    });
    const result = tryMigrateCardDescriptionFields({
      description: existing,
      descriptionHtml: '<p>Legacy note</p>',
    });
    expect(result).toBeNull();
  });
});
