import { useRef, useState, type FormEvent } from 'react';
import { Box, Button, Group, Stack, Textarea, TextInput } from '@mantine/core';
import { LIST_NAME_MAX_LENGTH } from '../../../../shared/constants/entityTextLimits.js';
import { CARD_DESCRIPTION_TEXT_MAX_LENGTH } from '../../../../shared/constants/cardDescription.js';
import { prewarmMalwareScannerOnUploadIntent } from '../../../utils/prewarmMalwareScanner.js';

export interface VisualStorytellingAddHeroDraft {
  readonly title: string;
  readonly caption: string;
  readonly files: File[];
}

export interface VisualStorytellingAddHeroProps {
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (draft: VisualStorytellingAddHeroDraft) => Promise<void>;
}

export function VisualStorytellingAddHero({ busy, onCancel, onSubmit }: VisualStorytellingAddHeroProps) {
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState('No image selected');
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleOver = title.length > LIST_NAME_MAX_LENGTH;
  const captionOver = caption.length > CARD_DESCRIPTION_TEXT_MAX_LENGTH;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === '') {
      setError('Hero title is required');
      return;
    }
    if (titleOver || captionOver) {
      return;
    }
    setError(null);
    await onSubmit({ title: trimmed, caption: caption.trim(), files });
  };

  return (
    <Box className="vs-add-hero">
      <form onSubmit={(event) => void submit(event)}>
        <Stack gap="xs">
          <TextInput
            label="Hero title"
            placeholder="Section title"
            value={title}
            onChange={(event) => {
              setTitle(event.currentTarget.value);
              if (error != null) {
                setError(null);
              }
            }}
            disabled={busy}
            required
            maxLength={LIST_NAME_MAX_LENGTH}
            error={error ?? (titleOver ? `Cannot exceed ${LIST_NAME_MAX_LENGTH} characters` : undefined)}
            autoFocus
          />
          <Textarea
            label="Caption overlay (optional)"
            placeholder="Shown on the hero image"
            value={caption}
            onChange={(event) => setCaption(event.currentTarget.value)}
            disabled={busy}
            autosize
            minRows={2}
            error={captionOver ? `Cannot exceed ${CARD_DESCRIPTION_TEXT_MAX_LENGTH} characters` : undefined}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            aria-hidden
            tabIndex={-1}
            onChange={(event) => {
              const next = event.currentTarget.files != null ? Array.from(event.currentTarget.files) : [];
              setFiles(next);
              setFileLabel(next[0]?.name ?? 'No image selected');
            }}
          />
          <Group gap="xs" wrap="wrap">
            <Button
              type="button"
              variant="light"
              disabled={busy}
              onClick={() => {
                prewarmMalwareScannerOnUploadIntent();
                fileRef.current?.click();
              }}
            >
              Choose hero image
            </Button>
            <span>{fileLabel}</span>
          </Group>
          <Group gap="xs">
            <Button type="submit" loading={busy} disabled={titleOver || captionOver}>
              Add Hero
            </Button>
            <Button type="button" variant="subtle" color="gray" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          </Group>
        </Stack>
      </form>
    </Box>
  );
}
