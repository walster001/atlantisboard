import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { getCardDescriptionTextLength } from '../cardDescriptionTiptap.js';

/**
 * Updates only DOM (no React state) so typing does not re-render the card detail shell or this editor tree.
 */
export function DescriptionCharLimitHint({
  editor,
  maxChars,
}: {
  readonly editor: Editor;
  readonly maxChars: number;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId = 0;
    const flush = (): void => {
      const row = rowRef.current;
      if (row == null) {
        return;
      }
      const n = getCardDescriptionTextLength(editor.getJSON());
      const remaining = maxChars - n;
      if (remaining <= 5) {
        row.style.display = 'block';
        row.textContent = `${n}/${maxChars} characters`;
      } else {
        row.style.display = 'none';
        row.textContent = '';
      }
    };
    const schedule = (): void => {
      if (rafId !== 0) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        flush();
      });
    };
    flush();
    editor.on('update', schedule);
    return () => {
      editor.off('update', schedule);
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [editor, maxChars]);

  return (
    <div
      ref={rowRef}
      role="status"
      aria-live="polite"
      style={{
        display: 'none',
        fontSize: 'var(--mantine-font-size-xs)',
        color: 'var(--mantine-color-dimmed)',
        padding: '4px var(--mantine-spacing-xs)',
        backgroundColor: 'var(--mantine-color-gray-1)',
      }}
    />
  );
}
