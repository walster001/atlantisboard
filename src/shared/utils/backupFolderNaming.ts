/** Human-readable backup folder ids (e.g. `07-06-26_0815PM`) and default archive names. */

const DISPLAY_FOLDER_ID_RE =
  /^([0-9]{2})-([0-9]{2})-([0-9]{2})_([0-9]{2})([0-9]{2})(AM|PM)(?:-([0-9]+))?$/;

/** Matches legacy ids (`{epochMs}_{iso}`) and display ids (`DD-MM-YY_HHMMAM|PM`). */
export const BACKUP_FOLDER_ID_PATTERN =
  /^(?:[0-9]+_[0-9A-Za-z.-]+|[0-9]{2}-[0-9]{2}-[0-9]{2}_[0-9]{4}(?:AM|PM)(?:-[0-9]+)?)$/;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local date/time stamp for backup folder names: `07-06-26_0815PM`. */
export function formatBackupFolderTimestamp(date: Date = new Date()): string {
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = pad2(date.getFullYear() % 100);
  let hours24 = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  let hours12 = hours24 % 12;
  if (hours12 === 0) {
    hours12 = 12;
  }
  const time = `${pad2(hours12)}${pad2(minutes)}${ampm}`;
  return `${day}-${month}-${year}_${time}`;
}

export function buildDefaultBackupFilename(date: Date = new Date()): string {
  return `backup-${formatBackupFolderTimestamp(date)}.zip`;
}

export function isValidBackupFolderId(folderId: string): boolean {
  return BACKUP_FOLDER_ID_PATTERN.test(folderId);
}

export function newBackupFolderId(existingFolderIds?: ReadonlySet<string>): string {
  const base = formatBackupFolderTimestamp(new Date());
  if (existingFolderIds == null || !existingFolderIds.has(base)) {
    return base;
  }
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!existingFolderIds.has(candidate)) {
      return candidate;
    }
  }
  return `${base}-${Date.now()}`;
}

export function parseBackupFolderMillis(folderId: string): number | null {
  const displayMatch = folderId.match(DISPLAY_FOLDER_ID_RE);
  if (displayMatch != null) {
    const day = Number.parseInt(displayMatch[1] ?? '', 10);
    const month = Number.parseInt(displayMatch[2] ?? '', 10);
    const yearShort = Number.parseInt(displayMatch[3] ?? '', 10);
    const hours12 = Number.parseInt(displayMatch[4] ?? '', 10);
    const minutes = Number.parseInt(displayMatch[5] ?? '', 10);
    const ampm = displayMatch[6];
    if (
      !Number.isFinite(day) ||
      !Number.isFinite(month) ||
      !Number.isFinite(yearShort) ||
      !Number.isFinite(hours12) ||
      !Number.isFinite(minutes) ||
      (ampm !== 'AM' && ampm !== 'PM')
    ) {
      return null;
    }
    let hours24 = hours12 % 12;
    if (ampm === 'PM') {
      hours24 += 12;
    }
    const year = 2000 + yearShort;
    const ms = new Date(year, month - 1, day, hours24, minutes, 0, 0).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  const legacySep = folderId.indexOf('_');
  if (legacySep > 0 && /^[0-9]+_/.test(folderId)) {
    const ms = Number(folderId.slice(0, legacySep));
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }

  return null;
}

/** Table label — display ids pass through; legacy ids are converted when possible. */
export function formatBackupFolderDisplayLabel(folderId: string): string {
  const pendingSuffix = folderId.indexOf('_pending-');
  if (pendingSuffix > 0) {
    return formatBackupFolderDisplayLabel(folderId.slice(0, pendingSuffix));
  }
  if (DISPLAY_FOLDER_ID_RE.test(folderId)) {
    return folderId;
  }
  const ms = parseBackupFolderMillis(folderId);
  if (ms != null) {
    return formatBackupFolderTimestamp(new Date(ms));
  }
  return folderId;
}

export function formatBackupFolderDisplayLabelWithFilename(
  folderId: string,
  filePath: string,
): string {
  const base = formatBackupFolderDisplayLabel(folderId);
  const fileName = filePath.split(/[/\\]/).pop()?.trim();
  if (fileName != null && fileName !== '' && fileName.toLowerCase().endsWith('.zip')) {
    const stem = fileName.replace(/\.zip$/i, '');
    if (stem !== base && stem !== folderId) {
      return `${base} (${fileName})`;
    }
  }
  return base;
}
