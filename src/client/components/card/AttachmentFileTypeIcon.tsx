import { IconFileMusic, IconPaperclip } from '@tabler/icons-react';
import type { ReactElement } from 'react';
import { isMusicAttachmentMimeType } from '../../utils/fileUtils.js';

const ATTACHMENT_FILE_ICON_SIZE = 40;
const ATTACHMENT_FILE_ICON_STROKE = 1;
const ATTACHMENT_FILE_ICON_COLOR = 'var(--board-card-detail-text, #868e96)';

export interface AttachmentFileTypeIconProps {
  readonly mimeType: string;
}

/** Tabler icon for non-preview attachment rows (paperclip, or file-music for audio). */
export function AttachmentFileTypeIcon({ mimeType }: AttachmentFileTypeIconProps): ReactElement {
  if (isMusicAttachmentMimeType(mimeType)) {
    return (
      <IconFileMusic
        size={ATTACHMENT_FILE_ICON_SIZE}
        stroke={ATTACHMENT_FILE_ICON_STROKE}
        color={ATTACHMENT_FILE_ICON_COLOR}
        aria-hidden
      />
    );
  }

  return (
    <IconPaperclip
      size={ATTACHMENT_FILE_ICON_SIZE}
      stroke={ATTACHMENT_FILE_ICON_STROKE}
      color={ATTACHMENT_FILE_ICON_COLOR}
      aria-hidden
    />
  );
}
