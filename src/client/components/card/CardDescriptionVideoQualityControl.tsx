import { Menu, UnstyledButton } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import { useCallback, useState, type MouseEvent, type PointerEvent } from 'react';
import {
  VIDEO_RENDITION_HEIGHTS,
  pickVideoPlaybackHeight,
  videoQualityPreferenceLabel,
  type VideoAttachmentQualityMeta,
  type VideoQualityPreference,
} from '../../../shared/videoQuality.js';

export interface CardDescriptionVideoQualityControlProps {
  readonly quality: VideoQualityPreference;
  readonly qualityMeta: VideoAttachmentQualityMeta | null;
  readonly onQualityChange: (next: VideoQualityPreference) => void;
  readonly onDescriptionClickCapture?: (event: MouseEvent | PointerEvent) => void;
  /** Render menu inline (required in fullscreen — body portal is outside the fullscreen element). */
  readonly isFullscreen?: boolean;
  readonly onMenuOpenChange?: (open: boolean) => void;
}

export function CardDescriptionVideoQualityControl({
  quality,
  qualityMeta,
  onQualityChange,
  onDescriptionClickCapture,
  isFullscreen = false,
  onMenuOpenChange,
}: CardDescriptionVideoQualityControlProps) {
  const [menuOpened, setMenuOpened] = useState(false);
  const activeHeight =
    qualityMeta != null
      ? pickVideoPlaybackHeight({
          preference: quality,
          sourceTier: qualityMeta.sourceTier,
        })
      : null;
  const manualHeights =
    qualityMeta?.streaming.ready === true
      ? qualityMeta.streaming.renditionHeights
      : qualityMeta?.availableHeights ?? VIDEO_RENDITION_HEIGHTS;
  const selectableOptions: readonly VideoQualityPreference[] = [
    'auto',
    ...manualHeights.map((height) => `${height}` as VideoQualityPreference),
  ];
  const label =
    quality === 'auto' && activeHeight != null
      ? `Auto (${activeHeight}p)`
      : videoQualityPreferenceLabel(quality);

  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      setMenuOpened(open);
      onMenuOpenChange?.(open);
    },
    [onMenuOpenChange],
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      onDescriptionClickCapture?.(event);
      event.stopPropagation();
    },
    [onDescriptionClickCapture],
  );

  return (
    <Menu
      shadow="md"
      width={160}
      opened={menuOpened}
      onChange={handleMenuOpenChange}
      withinPortal={!isFullscreen}
      position="top-end"
      closeOnItemClick
      zIndex={4000}
    >
      <Menu.Target>
        <UnstyledButton
          className="card-desc-video-quality-button"
          aria-label={`Video quality: ${label}`}
          title={`Quality: ${label}`}
          onClick={handleClick}
        >
          <IconSettings
            className="card-desc-video-quality-button__icon"
            size={18}
            stroke={1.75}
            aria-hidden
          />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown className="card-desc-video-quality-menu">
        {selectableOptions.map((option) => (
          <Menu.Item
            key={option}
            data-active={option === quality ? 'true' : undefined}
            onClick={() => {
              onQualityChange(option);
            }}
          >
            {videoQualityPreferenceLabel(option)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
