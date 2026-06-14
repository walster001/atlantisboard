import type { CSSProperties } from 'react';

export const DEFAULT_AUDIO_DISPLAY_TITLE = '';
export const DEFAULT_AUDIO_DISPLAY_DESCRIPTION = '';
export const AUDIO_DISPLAY_TITLE_MAX_LENGTH = 200;
export const AUDIO_DISPLAY_DESCRIPTION_MAX_LENGTH = 500;

/** Default podcast player text colour (title, time, controls). */
export const DEFAULT_AUDIO_TEXT_COLOR = '#212529';
/** Default podcast player shell background. */
export const DEFAULT_AUDIO_BG_COLOR = '#ffffff';
/** Default control icon hover colour (mantine blue). */
export const DEFAULT_AUDIO_BUTTON_HOVER_COLOR = '#228be6';

/** Placeholder time row in the editor skeleton (matches mantine-audio before metadata loads). */
export const AUDIO_SKELETON_EXAMPLE_TIME = '0:00 / 0:00';

export interface AudioDisplayAttrs {
  readonly displayTitle: string;
  readonly displayDescription: string;
  readonly coverSrc: string | null;
  readonly textColor: string;
  readonly bgColor: string;
  readonly buttonHoverColor: string;
}

type AudioColorAttrKey = 'textColor' | 'bgColor' | 'buttonHoverColor';

function readAudioColorAttr(
  attrs: Record<string, unknown>,
  key: AudioColorAttrKey,
  fallback: string,
): string {
  const raw = attrs[key];
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : fallback;
}

export function readAudioDisplayAttrs(attrs: Record<string, unknown>): AudioDisplayAttrs {
  const displayTitle =
    typeof attrs.displayTitle === 'string' ? attrs.displayTitle.trim() : DEFAULT_AUDIO_DISPLAY_TITLE;
  const displayDescription =
    typeof attrs.displayDescription === 'string'
      ? attrs.displayDescription.trim()
      : DEFAULT_AUDIO_DISPLAY_DESCRIPTION;
  const coverSrc =
    typeof attrs.coverSrc === 'string' && attrs.coverSrc.trim() !== '' ? attrs.coverSrc.trim() : null;
  const textColor = readAudioColorAttr(attrs, 'textColor', DEFAULT_AUDIO_TEXT_COLOR);
  return {
    displayTitle,
    displayDescription,
    coverSrc,
    textColor,
    bgColor: readAudioColorAttr(attrs, 'bgColor', DEFAULT_AUDIO_BG_COLOR),
    buttonHoverColor: readAudioColorAttr(
      attrs,
      'buttonHoverColor',
      textColor !== DEFAULT_AUDIO_TEXT_COLOR ? textColor : DEFAULT_AUDIO_BUTTON_HOVER_COLOR,
    ),
  };
}

/** Inline shell styling for podcast audio chrome (player + editor skeleton). */
export function audioPodcastAppearanceStyle(
  textColor: string,
  bgColor: string,
  buttonHoverColor: string,
): CSSProperties {
  return {
    backgroundColor: bgColor,
    color: textColor,
    ['--audio-color' as string]: textColor,
    ['--audio-text-color' as string]: textColor,
    ['--audio-button-hover-color' as string]: buttonHoverColor,
    ['--audio-timeline-color' as string]: textColor,
    ['--audio-timeline-thumb-color' as string]: textColor,
  };
}

export function hasAudioDisplayChrome(display: AudioDisplayAttrs): boolean {
  return (
    display.displayTitle !== '' ||
    display.displayDescription !== '' ||
    display.coverSrc != null
  );
}
