import { memo } from 'react';
import { IconPlayerPlay } from '@tabler/icons-react';
import { UnstyledButton } from '@mantine/core';
import { useVideoPosterUrl } from '../../hooks/useVideoPosterUrl.js';
import { api } from '../../utils/api.js';

interface AttachmentVideoThumbnailProps {
  readonly attachmentId: string;
  readonly name: string;
  readonly disabled: boolean;
  readonly onPreview: () => void;
}

export const AttachmentVideoThumbnail = memo(function AttachmentVideoThumbnail({
  attachmentId,
  name,
  disabled,
  onPreview,
}: AttachmentVideoThumbnailProps) {
  const posterUrl = useVideoPosterUrl(api.getAttachmentFileUrl(attachmentId), undefined);

  return (
    <UnstyledButton
      type="button"
      aria-label={`Preview ${name}`}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onPreview();
        }
      }}
      style={{
        width: 160,
        minWidth: 160,
        height: 96,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: 'var(--mantine-color-dark-9)',
        border: '1px solid var(--mantine-color-gray-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        cursor: disabled ? 'default' : 'pointer',
        position: 'relative',
      }}
    >
      {posterUrl != null ? (
        <img
          src={posterUrl}
          alt=""
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : null}
      <IconPlayerPlay
        size={36}
        stroke={1.5}
        color="var(--mantine-color-gray-4)"
        style={{ position: 'relative', zIndex: 1 }}
        aria-hidden
      />
    </UnstyledButton>
  );
});
