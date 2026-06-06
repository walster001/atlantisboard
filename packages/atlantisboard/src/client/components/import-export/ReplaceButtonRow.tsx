import { useRef } from 'react';
import { Button, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconPhotoOff } from '@tabler/icons-react';
import type {
  InlineButtonIconReplacement,
  InlineButtonImportColorOverrides,
  WekanLegacyInlineButtonCandidate,
} from '../../../shared/import/importPreflight.js';
import { extractWekanLegacyInlineButtonColorsFromHtml } from '../../../shared/import/wekanLegacyInlineHtml.js';
import { readImageAsDataUrl } from '../../utils/readImageAsDataUrl.js';
import { DEFAULT_PREVIEW_BG, DEFAULT_PREVIEW_TEXT, upsertReplacement } from './replaceButtonsHelpers.js';

interface ReplaceButtonRowProps {
  readonly button: WekanLegacyInlineButtonCandidate;
  readonly replacement: InlineButtonIconReplacement | undefined;
  readonly colorOverrides: InlineButtonImportColorOverrides;
  readonly replacements: readonly InlineButtonIconReplacement[];
  readonly onChangeReplacements: (next: readonly InlineButtonIconReplacement[]) => void;
}

export function ReplaceButtonRow({
  button,
  replacement,
  colorOverrides,
  replacements,
  onChangeReplacements,
}: ReplaceButtonRowProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const importColors = extractWekanLegacyInlineButtonColorsFromHtml(button.originalHtml);
  const previewTextColor =
    colorOverrides.textColor?.trim() || importColors.textColor || DEFAULT_PREVIEW_TEXT;
  const previewBgColor =
    colorOverrides.bgColor?.trim() || importColors.bgColor || DEFAULT_PREVIEW_BG;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="xs">
        <Text size="sm" fw={600}>
          Preview
        </Text>
        <Group gap="xs">
          <Button
            component="a"
            href={button.href}
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
            variant="light"
            styles={{
              root: {
                color: previewTextColor,
                backgroundColor: previewBgColor,
              },
            }}
            leftSection={
              replacement?.replacementDataUrl ? (
                <img
                  src={replacement.replacementDataUrl}
                  alt=""
                  width={16}
                  height={16}
                  style={{ borderRadius: 3, objectFit: 'cover' }}
                />
              ) : (
                <ThemeIcon size={16} radius="sm" variant="light" color="gray">
                  <IconPhotoOff size={11} />
                </ThemeIcon>
              )
            }
          >
            {button.buttonText}
          </Button>
        </Group>

        <Text size="xs" c="dimmed">
          Original icon source:{' '}
          <Text component="span" inherit style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            {button.iconSrc}
          </Text>
        </Text>
        {importColors.textColor != null || importColors.bgColor != null ? (
          <Text size="xs" c="dimmed">
            Import colours:{' '}
            {importColors.textColor != null ? `text ${importColors.textColor}` : ''}
            {importColors.textColor != null && importColors.bgColor != null ? ', ' : ''}
            {importColors.bgColor != null ? `background ${importColors.bgColor}` : ''}
          </Text>
        ) : null}
        {button.cardTitle ? (
          <Text size="xs" c="dimmed">
            Example card: {button.cardTitle}
          </Text>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            void readImageAsDataUrl(f).then((dataUrl) => {
              onChangeReplacements(upsertReplacement(replacements, button.iconSrc, dataUrl));
            });
          }}
        />
        <Group gap="xs">
          <Button
            size="xs"
            variant="default"
            onClick={() => {
              fileRef.current?.click();
            }}
          >
            {replacement?.replacementDataUrl ? 'Change icon' : 'Upload replacement icon'}
          </Button>
          <Text size="xs" c={replacement?.replacementDataUrl ? 'green' : 'dimmed'}>
            {replacement?.replacementDataUrl ? 'Uploaded' : 'Not uploaded'}
          </Text>
        </Group>
      </Stack>
    </Paper>
  );
}
