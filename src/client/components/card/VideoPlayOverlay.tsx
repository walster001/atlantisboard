import { IconPlayerPlay } from '@tabler/icons-react';
import './videoPlayOverlay.css';

type VideoPlayOverlaySize = 'sm' | 'md' | 'lg';

const ICON_SIZE: Record<VideoPlayOverlaySize, number> = {
  sm: 22,
  md: 28,
  lg: 32,
};

interface VideoPlayOverlayProps {
  readonly size?: VideoPlayOverlaySize;
  readonly className?: string;
}

/** Centered play affordance — semi-transparent black circle over video posters and placeholders. */
export function VideoPlayOverlay({ size = 'md', className }: VideoPlayOverlayProps) {
  const rootClass = ['video-play-overlay', `video-play-overlay--${size}`, className]
    .filter((part): part is string => part != null && part.trim() !== '')
    .join(' ');

  return (
    <span className={rootClass} aria-hidden>
      <span className="video-play-overlay__circle">
        <IconPlayerPlay
          className="video-play-overlay__icon"
          size={ICON_SIZE[size]}
          stroke={1.75}
          fill="currentColor"
        />
      </span>
    </span>
  );
}
