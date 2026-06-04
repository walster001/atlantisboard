import { ActionIcon, Box, Button, Group } from '@mantine/core';
import { IconUpload, IconX } from '@tabler/icons-react';
import type { RefObject } from 'react';

interface ImageUploadFieldProps {
  readonly hasImage: boolean;
  readonly imageUrl: string | undefined;
  readonly previewSize: { readonly width: number; readonly height: number };
  readonly fit: 'contain' | 'cover';
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly accept: string;
  readonly uploadLabel: string;
  readonly replaceLabel?: string;
  readonly onFileChange: (file: File | null) => void;
  readonly onPickClick: () => void;
  readonly onClear: () => void;
  readonly disabled?: boolean;
  readonly clearAriaLabel: string;
}

export function ImageUploadField({
  hasImage,
  imageUrl,
  previewSize,
  fit,
  inputRef,
  accept,
  uploadLabel,
  replaceLabel,
  onFileChange,
  onPickClick,
  onClear,
  disabled = false,
  clearAriaLabel,
}: ImageUploadFieldProps) {
  return (
    <Group align="flex-end" wrap="wrap">
      {hasImage ? (
        <Box pos="relative" style={{ width: previewSize.width, height: previewSize.height }}>
          <Box
            component="img"
            src={imageUrl}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: fit,
              borderRadius: 8,
              border: '1px solid var(--mantine-color-gray-3)',
            }}
          />
          <ActionIcon
            color="red"
            variant="filled"
            size="sm"
            radius="xl"
            pos="absolute"
            top={4}
            right={4}
            aria-label={clearAriaLabel}
            onClick={onClear}
            disabled={disabled}
          >
            <IconX size={14} />
          </ActionIcon>
        </Box>
      ) : (
        <Box
          w={previewSize.width}
          h={previewSize.height}
          style={{
            border: '1px dashed var(--mantine-color-gray-4)',
            borderRadius: 8,
            background: 'var(--mantine-color-gray-0)',
          }}
        />
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        disabled={disabled}
      />
      <Button variant="light" leftSection={<IconUpload size={18} />} onClick={onPickClick} disabled={disabled}>
        {hasImage && replaceLabel != null ? replaceLabel : uploadLabel}
      </Button>
    </Group>
  );
}
