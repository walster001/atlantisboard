import { memo, useCallback, useMemo, useRef } from 'react';
import {
  Alert,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { IconPhotoOff } from '@tabler/icons-react';
import type {
  InlineButtonIconReplacement,
  WekanLegacyInlineButtonCandidate,
} from '../../../shared/import/importPreflight.js';
import { readImageAsDataUrl } from '../../utils/readImageAsDataUrl.js';

interface ReplaceButtonsTabProps {
  readonly buttons: readonly WekanLegacyInlineButtonCandidate[];
  readonly replacements: readonly InlineButtonIconReplacement[];
  readonly onChangeReplacements: (next: readonly InlineButtonIconReplacement[]) => void;
}

function uniqueByIconSrc(
  buttons: readonly WekanLegacyInlineButtonCandidate[],
): readonly WekanLegacyInlineButtonCandidate[] {
  const seen = new Set<string>();
  const out: WekanLegacyInlineButtonCandidate[] = [];
  for (const b of buttons) {
    const key = b.iconSrc.trim();
    if (key === '' || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(b);
  }
  return out;
}

export const ReplaceButtonsTab = memo(function ReplaceButtonsTab({
  buttons,
  replacements,
  onChangeReplacements,
}: ReplaceButtonsTabProps) {
  const uniqueButtons = useMemo(() => uniqueByIconSrc(buttons), [buttons]);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const replacementByIcon = useMemo(() => {
    const map = new Map<string, InlineButtonIconReplacement>();
    for (const item of replacements) {
      map.set(item.iconSrc, item);
    }
    return map;
  }, [replacements]);

  const handlePick = useCallback(async (iconSrc: string, file: File): Promise<void> => {
    const dataUrl = await readImageAsDataUrl(file);

    const filtered = replacements.filter((r) => r.iconSrc !== iconSrc);
    onChangeReplacements([
      ...filtered,
      { iconSrc, replacementDataUrl: dataUrl },
    ]);
  }, [onChangeReplacements, replacements]);

  if (uniqueButtons.length === 0) {
    return (
      <Alert color="green" radius="md">
        No legacy inline buttons detected in this Wekan file.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Alert color="blue" radius="md">
        Found {uniqueButtons.length} unique legacy inline button icon reference(s). Upload replacement icons
        now so imported inline buttons use valid image sources.
      </Alert>

      {uniqueButtons.map((button) => {
        const replacement = replacementByIcon.get(button.iconSrc);
        return (
          <Paper key={button.iconSrc} withBorder radius="md" p="md">
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
              {button.cardTitle ? (
                <Text size="xs" c="dimmed">
                  Example card: {button.cardTitle}
                </Text>
              ) : null}

              <input
                ref={(node) => {
                  fileRefs.current[button.iconSrc] = node;
                }}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void handlePick(button.iconSrc, f);
                }}
              />
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => {
                    fileRefs.current[button.iconSrc]?.click();
                  }}
                >
                  {replacement ? 'Change icon' : 'Upload replacement icon'}
                </Button>
                <Text size="xs" c={replacement ? 'green' : 'dimmed'}>
                  {replacement ? 'Uploaded' : 'Not uploaded'}
                </Text>
              </Group>
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
});

