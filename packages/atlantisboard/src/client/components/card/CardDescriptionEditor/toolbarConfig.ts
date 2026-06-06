import type { Editor } from '@tiptap/core';
import { BOARD_PRESET_COLOURS } from '../../../constants/boardPresetColors.js';

/** Shown in the colour picker when the selection has no text colour yet. */
export const EDITOR_TEXT_COLOR_FALLBACK = BOARD_PRESET_COLOURS[9] ?? '#344563';

export const FONT_SIZE_PX_PRESETS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36] as const;
export const LINE_HEIGHT_PRESETS = ['1', '1.1', '1.15', '1.2', '1.35', '1.5', '1.75', '2'] as const;
export const TOOLBAR_BUTTON_SIZE = 'md';
export const TOOLBAR_ICON_SIZE = 22;

export function applyBlockLineHeight(editor: Editor, lineHeight: string | null): void {
  const chain = editor.chain().focus();
  if (lineHeight == null) {
    if (editor.isActive('heading')) {
      chain.resetAttributes('heading', 'lineHeight').run();
    } else if (editor.isActive('paragraph')) {
      chain.resetAttributes('paragraph', 'lineHeight').run();
    }
    return;
  }
  if (editor.isActive('heading')) {
    chain.updateAttributes('heading', { lineHeight }).run();
    return;
  }
  if (editor.isActive('paragraph')) {
    chain.updateAttributes('paragraph', { lineHeight }).run();
  }
}
