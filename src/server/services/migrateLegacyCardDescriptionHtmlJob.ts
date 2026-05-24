import { Card } from '../models/Card.js';
import { logger } from '../utils/logger.js';
import {
  descriptionJsonNeedsHtmlMigration,
  migrateLegacyDescriptionHtmlToJson,
} from '../utils/migrateLegacyCardDescriptionHtml.js';

const BATCH_SIZE = 100;

/**
 * One-time startup migration: persist TipTap JSON for cards that only have legacy `descriptionHtml`.
 */
export async function migrateLegacyCardDescriptionHtmlBatch(): Promise<number> {
  let migrated = 0;
  let lastId: string | null = null;

  for (;;) {
    const filter: Record<string, unknown> = {
      descriptionHtml: { $exists: true, $nin: [null, ''] },
    };
    if (lastId != null) {
      filter._id = { $gt: lastId };
    }

    const batch = await Card.find(filter)
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .select('_id description descriptionHtml')
      .lean();

    if (batch.length === 0) {
      break;
    }

    for (const card of batch) {
      lastId = card._id.toString();
      const description = typeof card.description === 'string' ? card.description : undefined;
      const descriptionHtml =
        typeof card.descriptionHtml === 'string' ? card.descriptionHtml : undefined;

      if (!descriptionJsonNeedsHtmlMigration(description)) {
        continue;
      }
      const html = descriptionHtml?.trim() ?? '';
      if (html === '') {
        continue;
      }

      const migratedJson = migrateLegacyDescriptionHtmlToJson(html);
      if (migratedJson == null) {
        continue;
      }

      await Card.updateOne(
        { _id: card._id },
        {
          $set: { description: migratedJson },
          $unset: { descriptionHtml: '' },
        },
      );
      migrated += 1;
    }

    if (batch.length < BATCH_SIZE) {
      break;
    }
  }

  if (migrated > 0) {
    logger.info({ migrated }, 'Migrated legacy card descriptionHtml to TipTap JSON');
  }

  return migrated;
}
