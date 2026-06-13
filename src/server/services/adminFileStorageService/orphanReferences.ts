import {
  MINIO_BUCKET_BACKGROUNDS,
  MINIO_BUCKET_BRANDING,
  MINIO_BUCKET_CARD_ATTACHMENTS,
  MINIO_BUCKET_FONTS,
  MINIO_BUCKET_IMPORT_INLINE,
  MINIO_BUCKET_NAMES,
  MINIO_BUCKET_USER_AVATARS,
  type MinioBucketName,
} from '../../../shared/constants/minioBuckets.js';
import { AdminConfig } from '../../models/AdminConfig.js';
import { Board } from '../../models/Board.js';
import { Card } from '../../models/Card.js';
import { User } from '../../models/User.js';
import { extractObjectNameFromAttachmentUrl } from '../attachmentService/minioPaths.js';
import { collectImportInlineObjectNamesFromText } from '../importInlineAssetService.js';
import { isValidFontObjectKey } from '../fontService.js';

const BRANDING_PATH_RE =
  /^\/api\/v1\/branding\/(login-logo|favicon|home-nav-icon|home-bg-image|board-nav-icon)\/([a-f0-9-]{36}\.(png|jpg|jpeg|webp|svg|ico))$/i;

const BOARD_BACKGROUND_PATH_RE =
  /^\/api\/v1\/board-backgrounds\/([a-f0-9-]{36}\.(png|jpg|jpeg|webp|gif))$/i;

const USER_AVATAR_PATH_RE = /\/users\/avatar\/([a-f0-9]{24})(?:[/?]|$)/i;

const CARD_ATTACHMENT_OBJECT_KEY_RE = /^[a-f0-9]{24}\/[a-f0-9-]{36}\.[^/]+$/i;

/** Buckets scanned for orphan objects (MinIO keys with no matching app DB reference). */
export const ORPHAN_SCAN_BUCKET_NAMES = MINIO_BUCKET_NAMES;

export function pathnameFromAssetInput(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      return new URL(trimmed).pathname;
    } catch {
      return '';
    }
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function brandingObjectKeysFromPublicUrl(input: string): readonly string[] {
  const path = pathnameFromAssetInput(input);
  const match = path.match(BRANDING_PATH_RE);
  if (!match?.[1] || !match[2]) {
    return [];
  }
  const kind = match[1];
  const fileName = match[2];
  return [fileName, `${kind}/${fileName}`, `branding/${kind}/${fileName}`];
}

export function boardBackgroundObjectKeyFromPublicUrl(input: string): string | null {
  const path = pathnameFromAssetInput(input);
  const match = path.match(BOARD_BACKGROUND_PATH_RE);
  return match?.[1] ?? null;
}

export function userAvatarObjectKeyFromProfilePicture(input: string, userId: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') {
    return null;
  }
  const match = trimmed.match(USER_AVATAR_PATH_RE);
  if (match?.[1] != null && match[1] === userId) {
    return `${userId}/avatar.webp`;
  }
  return null;
}

export function cardAttachmentObjectKeyFromStoredUrl(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed === '') {
    return null;
  }
  if (trimmed.startsWith('/api/v1/attachments/')) {
    return null;
  }
  if (CARD_ATTACHMENT_OBJECT_KEY_RE.test(trimmed)) {
    return trimmed;
  }
  try {
    return extractObjectNameFromAttachmentUrl(trimmed);
  } catch {
    return null;
  }
}

function addKey(
  map: Map<MinioBucketName, Set<string>>,
  bucket: MinioBucketName,
  key: string,
): void {
  if (key.trim() === '') {
    return;
  }
  const existing = map.get(bucket);
  if (existing != null) {
    existing.add(key);
    return;
  }
  map.set(bucket, new Set([key]));
}

function addKeys(
  map: Map<MinioBucketName, Set<string>>,
  bucket: MinioBucketName,
  keys: readonly string[],
): void {
  for (const key of keys) {
    addKey(map, bucket, key);
  }
}

export function markValidFontObjectKeyAsInUse(
  map: Map<MinioBucketName, Set<string>>,
  key: string,
): void {
  if (isValidFontObjectKey(key)) {
    addKey(map, MINIO_BUCKET_FONTS, key.replace(/\\/g, '/').split('/').pop() ?? key);
  }
}

export async function collectInUseMinioObjectKeys(): Promise<Map<MinioBucketName, Set<string>>> {
  const inUse = new Map<MinioBucketName, Set<string>>();

  const cards = await Card.find({ 'attachments.0': { $exists: true } })
    .select('attachments')
    .lean();
  for (const card of cards) {
    for (const attachment of card.attachments ?? []) {
      if (attachment.isPlaceholder === true) {
        continue;
      }
      const key = cardAttachmentObjectKeyFromStoredUrl(attachment.url);
      if (key != null) {
        addKey(inUse, MINIO_BUCKET_CARD_ATTACHMENTS, key);
      }
    }
  }

  const importInlineCards = await Card.find({
    $or: [
      { description: { $exists: true, $nin: [null, ''] } },
      { descriptionHtml: { $exists: true, $nin: [null, ''] } },
    ],
  })
    .select('description descriptionHtml')
    .lean();
  const importInlineNames = new Set<string>();
  for (const card of importInlineCards) {
    collectImportInlineObjectNamesFromText(
      typeof card.description === 'string' ? card.description : undefined,
      importInlineNames,
    );
    collectImportInlineObjectNamesFromText(
      typeof card.descriptionHtml === 'string' ? card.descriptionHtml : undefined,
      importInlineNames,
    );
  }
  for (const name of importInlineNames) {
    addKey(inUse, MINIO_BUCKET_IMPORT_INLINE, name);
  }

  const adminConfig = await AdminConfig.findOne()
    .select('loginScreenBranding appScreenBranding')
    .lean();
  if (adminConfig != null) {
    const login = adminConfig.loginScreenBranding;
    const app = adminConfig.appScreenBranding;
    if (typeof login?.logo === 'string') {
      addKeys(inUse, MINIO_BUCKET_BRANDING, brandingObjectKeysFromPublicUrl(login.logo));
    }
    if (typeof login?.faviconUrl === 'string') {
      addKeys(inUse, MINIO_BUCKET_BRANDING, brandingObjectKeysFromPublicUrl(login.faviconUrl));
    }
    if (typeof app?.homepageNavbarIconUrl === 'string') {
      addKeys(inUse, MINIO_BUCKET_BRANDING, brandingObjectKeysFromPublicUrl(app.homepageNavbarIconUrl));
    }
    if (typeof app?.homepageBackgroundImageUrl === 'string') {
      addKeys(inUse, MINIO_BUCKET_BRANDING, brandingObjectKeysFromPublicUrl(app.homepageBackgroundImageUrl));
    }
    if (typeof app?.boardNavbarIconUrl === 'string') {
      addKeys(inUse, MINIO_BUCKET_BRANDING, brandingObjectKeysFromPublicUrl(app.boardNavbarIconUrl));
    }
  }

  const boards = await Board.find({
    $or: [
      { background: { $exists: true, $nin: [null, ''] } },
      { 'themeSettings.backgroundImageUrl': { $exists: true, $nin: [null, ''] } },
    ],
  })
    .select('background themeSettings')
    .lean();
  for (const board of boards) {
    if (typeof board.background === 'string' && board.background.trim() !== '') {
      const key = boardBackgroundObjectKeyFromPublicUrl(board.background);
      if (key != null) {
        addKey(inUse, MINIO_BUCKET_BACKGROUNDS, key);
      }
    }
    const themeSettings = board.themeSettings as { backgroundImageUrl?: unknown } | undefined;
    if (typeof themeSettings?.backgroundImageUrl === 'string') {
      const key = boardBackgroundObjectKeyFromPublicUrl(themeSettings.backgroundImageUrl);
      if (key != null) {
        addKey(inUse, MINIO_BUCKET_BACKGROUNDS, key);
      }
    }
  }

  const users = await User.find({ profilePicture: { $exists: true, $nin: [null, ''] } })
    .select('_id profilePicture')
    .lean();
  for (const user of users) {
    const userId = String(user._id);
    if (typeof user.profilePicture !== 'string') {
      continue;
    }
    const key = userAvatarObjectKeyFromProfilePicture(user.profilePicture, userId);
    if (key != null) {
      addKey(inUse, MINIO_BUCKET_USER_AVATARS, key);
    }
  }

  return inUse;
}
