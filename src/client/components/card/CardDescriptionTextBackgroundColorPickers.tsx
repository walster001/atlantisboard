import { ColorInput, Group, Stack } from '@mantine/core';
import type { ReactElement } from 'react';

export interface CardDescriptionTextBackgroundColorPickersProps {
  readonly textColor: string;
  readonly bgColor: string;
  readonly onTextColorChange: (value: string) => void;
  readonly onBgColorChange: (value: string) => void;
  readonly hoverColor?: string;
  readonly onHoverColorChange?: (value: string) => void;
  readonly hoverColorLabel?: string;
}

export function CardDescriptionTextBackgroundColorPickers({
  textColor,
  bgColor,
  onTextColorChange,
  onBgColorChange,
  hoverColor,
  onHoverColorChange,
  hoverColorLabel = 'Hover colour',
}: CardDescriptionTextBackgroundColorPickersProps): ReactElement {
  const colorInputPopoverProps = { withinPortal: true, zIndex: 1000 } as const;

  return (
    <Stack gap="sm">
      <Group grow align="flex-start">
        <ColorInput
          label="Text color"
          value={textColor}
          onChange={onTextColorChange}
          format="hex"
          popoverProps={colorInputPopoverProps}
        />
        <ColorInput
          label="Background color"
          value={bgColor}
          onChange={onBgColorChange}
          format="hex"
          popoverProps={colorInputPopoverProps}
        />
      </Group>
      {hoverColor != null && onHoverColorChange != null ? (
        <ColorInput
          label={hoverColorLabel}
          value={hoverColor}
          onChange={onHoverColorChange}
          format="hex"
          popoverProps={colorInputPopoverProps}
        />
      ) : null}
    </Stack>
  );
}
