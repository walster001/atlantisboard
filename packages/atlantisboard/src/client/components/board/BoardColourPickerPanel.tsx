import type { CSSProperties } from 'react';
import {
  Box,
  ColorInput,
  ColorPicker,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { IconBan, IconCheck } from '@tabler/icons-react';
import {
  BOARD_PRESET_COLOURS,
  contrastIconColorForHex,
  normalizePresetHex,
} from '../../constants/boardPresetColors.js';

export interface BoardColourPickerPanelProps {
  readonly value: string;
  readonly onChange: (hex: string) => void;
  readonly disabled?: boolean;
  /** Optional "no colour" swatch rendered as the last item in preset grid. */
  readonly onClearColor?: () => void;
  /** Whether the optional "no colour" swatch is currently selected. */
  readonly noColorSelected?: boolean;
  /** Section label above the bordered panel (e.g. "Colour"). Pass `''` to hide. */
  readonly sectionLabel?: string;
  /**
   * `compact` uses a shorter gradient area, tighter preset grid, and smaller inputs
   * (e.g. card description toolbar). Default matches list/label modals.
   */
  readonly density?: 'comfortable' | 'compact';
}

/**
 * Shared colour UI: saturation/hue picker, preset grid, hex + eyedropper.
 * Used by label create/edit and list colour modals.
 */
function resolveSectionHeading(
  sectionLabel: string | undefined,
  density: 'comfortable' | 'compact',
): string | null {
  if (sectionLabel !== undefined) {
    return sectionLabel.trim() === '' ? null : sectionLabel;
  }
  return density === 'compact' ? null : 'Colour';
}

export function BoardColourPickerPanel({
  value,
  onChange,
  disabled = false,
  onClearColor,
  noColorSelected = false,
  sectionLabel,
  density = 'comfortable',
}: BoardColourPickerPanelProps) {
  const heading = resolveSectionHeading(sectionLabel, density);
  const isCompact = density === 'compact';

  return (
    <Box>
      {heading != null ? (
        <Text size={isCompact ? 'xs' : 'sm'} fw={500} mb={isCompact ? 6 : 'xs'}>
          {heading}
        </Text>
      ) : null}
      <Paper p={isCompact ? 'xs' : 'sm'} radius={isCompact ? 'sm' : 'md'} withBorder>
        <Stack gap={isCompact ? 'xs' : 'sm'}>
          <ColorPicker
            fullWidth
            format="hex"
            value={value}
            onChange={onChange}
            size={isCompact ? 'sm' : 'lg'}
            saturationLabel="Saturation and brightness"
            hueLabel="Hue"
            style={
              {
                '--cp-saturation-height': isCompact ? '4.25rem' : '10rem',
                '--cp-body-spacing': isCompact
                  ? 'var(--mantine-spacing-xs)'
                  : 'var(--mantine-spacing-sm)',
              } as CSSProperties
            }
          />
          <SimpleGrid
            cols={isCompact ? 8 : 7}
            spacing={isCompact ? 3 : 4}
            verticalSpacing={isCompact ? 3 : 4}
          >
            {BOARD_PRESET_COLOURS.map((c) => {
              const normalizedSelection = normalizePresetHex(value, BOARD_PRESET_COLOURS);
              const selected = normalizedSelection.toLowerCase() === c.toLowerCase();
              return (
                <UnstyledButton
                  key={c}
                  type="button"
                  onClick={() => {
                    onChange(c);
                  }}
                  disabled={disabled}
                  aria-label={`Preset colour ${c}`}
                  styles={{
                    root: {
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: 'var(--mantine-radius-sm)',
                      backgroundColor: c,
                      border: selected
                        ? '2px solid var(--mantine-color-blue-6)'
                        : '1px solid var(--mantine-color-gray-4)',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      minHeight: 0,
                      flexShrink: 0,
                      boxSizing: 'border-box',
                      '&:focus-visible': {
                        outline: '2px solid var(--mantine-color-blue-filled)',
                        outlineOffset: 1,
                      },
                      '@media (hover: hover)': {
                        '&:hover': {
                          filter: disabled ? undefined : 'brightness(0.96)',
                        },
                      },
                    },
                  }}
                >
                  {selected ? (
                    <IconCheck
                      size={isCompact ? 11 : 14}
                      stroke={2.5}
                      color={contrastIconColorForHex(c)}
                      aria-hidden
                    />
                  ) : null}
                </UnstyledButton>
              );
            })}
            {onClearColor ? (
              <UnstyledButton
                type="button"
                onClick={onClearColor}
                disabled={disabled}
                aria-label="No colour (use theme default)"
                styles={{
                  root: {
                    width: '100%',
                    aspectRatio: '1',
                    borderRadius: 'var(--mantine-radius-sm)',
                    border: noColorSelected
                      ? '2px solid var(--mantine-color-blue-6)'
                      : '1px solid var(--mantine-color-gray-4)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    minHeight: 0,
                    flexShrink: 0,
                    boxSizing: 'border-box',
                    background:
                      'repeating-linear-gradient(45deg, #f1f3f5 0 4px, #e9ecef 4px 8px)',
                    '&:focus-visible': {
                      outline: '2px solid var(--mantine-color-blue-filled)',
                      outlineOffset: 1,
                    },
                    '@media (hover: hover)': {
                      '&:hover': {
                        filter: disabled ? undefined : 'brightness(0.96)',
                      },
                    },
                  },
                }}
              >
                <IconBan
                  size={isCompact ? 11 : 14}
                  stroke={2.25}
                  color="var(--mantine-color-gray-7)"
                  aria-hidden
                />
              </UnstyledButton>
            ) : null}
          </SimpleGrid>
          <ColorInput
            label="Hex value"
            size={isCompact ? 'xs' : 'sm'}
            value={value}
            onChange={onChange}
            format="hex"
            withEyeDropper={!isCompact}
            {...(!isCompact
              ? {
                  eyeDropperButtonProps: { 'aria-label': 'Pick colour from screen' },
                }
              : {})}
            disabled={disabled}
          />
        </Stack>
      </Paper>
    </Box>
  );
}
