import { useEffect, useRef, type CSSProperties } from 'react';
import { applyTwemojiPlainTextDom } from './twemojiPlainTextDom.js';
import './twemojiPlainText.css';

export interface TwemojiPlainTextProps {
  readonly text: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/**
 * Renders plain text with Unicode emoji as Twitter spritesheet cells (same sheet as card descriptions).
 * Uses `textContent` segmentation so HTML in titles is not interpreted as markup.
 */
export function TwemojiPlainText({ text, className, style }: TwemojiPlainTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el == null) {
      return;
    }
    applyTwemojiPlainTextDom(el, text);
  }, [text]);
  return (
    <span
      ref={ref}
      className={['twemoji-plain-text', className].filter(Boolean).join(' ')}
      style={style}
    />
  );
}
