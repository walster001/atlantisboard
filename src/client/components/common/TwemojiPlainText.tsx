import twemoji from 'twemoji';
import { useEffect, useRef, type CSSProperties } from 'react';
import { TWEMOJI_PARSE_OPTIONS } from '../../../shared/twemojiPublic.js';
import './twemojiPlainText.css';

export interface TwemojiPlainTextProps {
  readonly text: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/**
 * Renders plain text with Unicode emoji replaced by Twemoji `<img>` (same assets as card description).
 * Uses `textContent` + `twemoji.parse` so HTML in titles is not interpreted as markup.
 * Runs in `useEffect` (not layout) so parsing stays off the layout/commit hot path when modals open.
 */
export function TwemojiPlainText({ text, className, style }: TwemojiPlainTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el == null) {
      return;
    }
    el.textContent = text;
    twemoji.parse(el, TWEMOJI_PARSE_OPTIONS);
  }, [text]);
  return (
    <span
      ref={ref}
      className={['twemoji-plain-text', className].filter(Boolean).join(' ')}
      style={style}
    />
  );
}
