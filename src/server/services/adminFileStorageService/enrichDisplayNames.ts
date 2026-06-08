import { MINIO_BUCKET_CARD_ATTACHMENTS } from '../../../shared/constants/minioBuckets.js';
import type { MinioBucketName } from '../../../shared/constants/minioBuckets.js';
import type { AdminFileStorageObjectEntry } from '../../../shared/types/adminFileStorage.js';
import { Card } from '../../models/Card.js';
import { getMinIOClient } from '../../config/minio.js';

const STAT_CONCURRENCY = 8;

export function decodeXFileNameMetadata(raw: string | undefined): string | undefined {
  if (raw == null || raw.trim() === '') {
    return undefined;
  }
  const trimmed = raw.trim();
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

export function resolveObjectDisplayName(params: {
  readonly cardAttachmentName?: string | undefined;
  readonly metadataFileName?: string | undefined;
}): string | undefined {
  const fromCard = params.cardAttachmentName?.trim();
  if (fromCard != null && fromCard !== '') {
    return fromCard;
  }
  const fromMeta = params.metadataFileName?.trim();
  if (fromMeta != null && fromMeta !== '') {
    return fromMeta;
  }
  return undefined;
}

type ObjectMetadataEnrichment = {
  readonly displayName?: string;
  readonly contentType?: string;
};

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += concurrency) {
    const chunk = items.slice(index, index + concurrency);
    const chunkResults = await Promise.all(chunk.map(mapper));
    results.push(...chunkResults);
  }
  return results;
}

async function buildCardAttachmentDisplayNames(keys: readonly string[]): Promise<Map<string, string>> {
  const uniqueKeys = [...new Set(keys.filter((key) => key.trim() !== ''))];
  if (uniqueKeys.length === 0) {
    return new Map();
  }

  const cards = await Card.find({ 'attachments.url': { $in: uniqueKeys } })
    .select('attachments.name attachments.url attachments.originalFileName')
    .lean();

  const out = new Map<string, string>();
  for (const card of cards) {
    for (const attachment of card.attachments ?? []) {
      const url = attachment.url?.trim() ?? '';
      if (url === '' || !uniqueKeys.includes(url)) {
        continue;
      }
      const label = attachment.name?.trim() || attachment.originalFileName?.trim();
      if (label != null && label !== '') {
        out.set(url, label);
      }
    }
  }
  return out;
}

async function fetchObjectMetadataEnrichment(
  bucket: MinioBucketName,
  keys: readonly string[],
): Promise<Map<string, ObjectMetadataEnrichment>> {
  const uniqueKeys = [...new Set(keys.filter((key) => key.trim() !== ''))];
  if (uniqueKeys.length === 0) {
    return new Map();
  }

  const client = getMinIOClient();
  const pairs = await mapWithConcurrency(uniqueKeys, STAT_CONCURRENCY, async (key) => {
    try {
      const stat = await client.statObject(bucket, key);
      const meta = stat.metaData ?? {};
      const rawFileName = meta['X-File-Name'] ?? meta['x-file-name'];
      const displayName = decodeXFileNameMetadata(
        typeof rawFileName === 'string' ? rawFileName : undefined,
      );
      const contentTypeRaw = meta['content-type'] ?? meta['Content-Type'];
      const contentType =
        typeof contentTypeRaw === 'string' && contentTypeRaw.trim() !== ''
          ? contentTypeRaw.trim()
          : undefined;
      return {
        key,
        enrichment: {
          ...(displayName != null ? { displayName } : {}),
          ...(contentType != null ? { contentType } : {}),
        } satisfies ObjectMetadataEnrichment,
      };
    } catch {
      return { key, enrichment: {} satisfies ObjectMetadataEnrichment };
    }
  });

  const out = new Map<string, ObjectMetadataEnrichment>();
  for (const pair of pairs) {
    if (Object.keys(pair.enrichment).length > 0) {
      out.set(pair.key, pair.enrichment);
    }
  }
  return out;
}

export async function enrichAdminFileStorageEntries(
  bucket: MinioBucketName,
  entries: readonly AdminFileStorageObjectEntry[],
): Promise<readonly AdminFileStorageObjectEntry[]> {
  const fileKeys = entries.filter((entry) => !entry.isFolder).map((entry) => entry.key);
  if (fileKeys.length === 0) {
    return entries;
  }

  const [cardNames, metadataByKey] = await Promise.all([
    bucket === MINIO_BUCKET_CARD_ATTACHMENTS
      ? buildCardAttachmentDisplayNames(fileKeys)
      : Promise.resolve(new Map<string, string>()),
    fetchObjectMetadataEnrichment(bucket, fileKeys),
  ]);

  return entries.map((entry) => {
    if (entry.isFolder) {
      return entry;
    }

    const meta = metadataByKey.get(entry.key);
    const displayName = resolveObjectDisplayName({
      cardAttachmentName: cardNames.get(entry.key),
      metadataFileName: meta?.displayName,
    });

    const contentType = entry.contentType ?? meta?.contentType ?? null;

    if (displayName == null && contentType === entry.contentType) {
      return entry;
    }

    return {
      ...entry,
      ...(displayName != null ? { displayName } : {}),
      contentType,
    };
  });
}
