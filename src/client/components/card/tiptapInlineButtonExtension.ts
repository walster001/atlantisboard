/**
 * Card description inline link button — block node with image-style resize handles (tiptap-extension-resize-image pattern).
 * Double-click the button in edit mode opens the styling modal (wired via editor.storage.inlineButton.openEditModal).
 */
import { mergeAttributes, Node as TiptapNode, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';

const MOBILE_BREAKPOINT = 768;
const DOT_SIZE_MOBILE = 16;
const DOT_SIZE_DESKTOP = 9;
const DOT_POS_MOBILE = '-8px';
const DOT_POS_DESKTOP = '-4px';
const BORDER_COLOR = '#6C6C6C';
/** Max absolute offset when dragging the inline button (px). */
const OFFSET_CLAMP = 800;

function isMobile(): boolean {
  return document.documentElement.clientWidth < MOBILE_BREAKPOINT;
}

function getDotPosition(): string {
  return isMobile() ? DOT_POS_MOBILE : DOT_POS_DESKTOP;
}

function getDotSize(): number {
  return isMobile() ? DOT_SIZE_MOBILE : DOT_SIZE_DESKTOP;
}

function clampWidth(
  width: number,
  limits: { minWidth?: number; maxWidth?: number }
): number {
  const min = limits.minWidth !== undefined ? Math.max(0, limits.minWidth) : 0;
  let w = Math.max(min, width);
  if (limits.maxWidth !== undefined && w > limits.maxWidth) {
    w = limits.maxWidth;
  }
  return w;
}

function normalizeWidthPx(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return `${Math.round(value)}px`;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }
  const match = /^([0-9]+(?:\.[0-9]+)?)(px)?$/i.exec(trimmed);
  if (match == null) {
    return undefined;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return `${Math.round(parsed)}px`;
}

function extractWidthFromStyle(style: string): string | null {
  const m = style.match(/width:\s*([0-9.]+)px/);
  return m ? m[1] : null;
}

function clearContainerBorder(container: HTMLElement): void {
  const s = container.getAttribute('style');
  if (s == null) {
    return;
  }
  const next = s
    .replace(/border:\s*1px dashed #6C6C6C;?/gi, '')
    .replace(/border:\s*1px dashed rgb\(108,\s*108,\s*108\);?/gi, '');
  container.setAttribute('style', next);
}

function removeResizeElements(container: HTMLElement): void {
  if (container.childElementCount > 3) {
    for (let i = 0; i < 5; i++) {
      const last = container.lastChild;
      if (last) {
        container.removeChild(last);
      }
    }
  }
}

function getContainerStyle(inline: boolean, width: string | undefined): string {
  const base = `width: ${width || '100%'}; height: auto; cursor: pointer;`;
  return inline ? `${base} display: inline-block;` : base;
}

function getWrapperStyle(inline: boolean): string {
  return inline
    ? 'display: inline-block; float: left; padding-right: 8px;'
    : 'display: flex';
}

function clampOffset(n: number): number {
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(-OFFSET_CLAMP, Math.min(OFFSET_CLAMP, Math.round(n)));
}

function stripTransformFromStyle(style: string): string {
  return style
    .replace(/\s*transform:\s*[^;]+;?/gi, '')
    .replace(/;\s*;/g, ';')
    .replace(/^\s*;\s*|\s*;\s*$/g, '')
    .trim();
}

function parseTranslatePx(style: string): { x: number; y: number } {
  const m = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/i.exec(style);
  if (m) {
    return { x: Number(m[1]), y: Number(m[2]) };
  }
  return { x: 0, y: 0 };
}

function buildWrapperStyleWithOffsets(
  baseWrapperStyle: string,
  offsetXPx: number,
  offsetYPx: number
): string {
  const bx = clampOffset(offsetXPx);
  const by = clampOffset(offsetYPx);
  let stripped = stripTransformFromStyle(baseWrapperStyle).replace(/\s+/g, ' ').trim();
  if (stripped.endsWith(';')) {
    stripped = stripped.slice(0, -1).trim();
  }
  if (bx === 0 && by === 0) {
    return stripped;
  }
  const transform = `transform: translate(${bx}px, ${by}px)`;
  return stripped === '' ? transform : `${stripped}; ${transform}`;
}

function readOffsetAttrs(attrs: Record<string, unknown>): { x: number; y: number } {
  const ox = attrs.offsetXPx;
  const oy = attrs.offsetYPx;
  return {
    x: typeof ox === 'number' && Number.isFinite(ox) ? clampOffset(ox) : 0,
    y: typeof oy === 'number' && Number.isFinite(oy) ? clampOffset(oy) : 0,
  };
}

function getDotStyle(index: number): string {
  const dp = getDotPosition();
  const ds = getDotSize();
  const positions = [
    `top: ${dp}; left: ${dp}; cursor: nwse-resize;`,
    `top: ${dp}; right: ${dp}; cursor: nesw-resize;`,
    `bottom: ${dp}; left: ${dp}; cursor: nesw-resize;`,
    `bottom: ${dp}; right: ${dp}; cursor: nwse-resize;`,
  ];
  return `position: absolute; width: ${ds}px; height: ${ds}px; border: 1.5px solid ${BORDER_COLOR}; border-radius: 50%; ${positions[index]}`;
}

type NodeViewContext = {
  node: PMNode;
  editor: Editor;
  getPos: (() => number | undefined) | undefined;
};

type ResizeElements = {
  wrapper: HTMLDivElement;
  container: HTMLDivElement;
  inner: HTMLAnchorElement;
};

class ResizeController {
  private readonly elements: ResizeElements;
  private readonly dispatchNodeView: () => void;
  private readonly resizeLimits: { minWidth?: number; maxWidth?: number };
  private state = { isResizing: false, startX: 0, startWidth: 0 };

  constructor(
    elements: ResizeElements,
    dispatchNodeView: () => void,
    resizeLimits: { minWidth?: number; maxWidth?: number } = {}
  ) {
    this.elements = elements;
    this.dispatchNodeView = dispatchNodeView;
    this.resizeLimits = resizeLimits;
  }

  createResizeHandle(index: number): HTMLDivElement {
    const dot = document.createElement('div');
    dot.setAttribute('style', getDotStyle(index));
    dot.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.state.isResizing = true;
      this.state.startX = e.clientX;
      this.state.startWidth = this.elements.container.offsetWidth;
      const onMouseMove = (ev: MouseEvent) => this.handleMouseMove(ev, index);
      const onMouseUp = () => {
        this.handleMouseUp();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
    dot.addEventListener(
      'touchstart',
      (e) => {
        if (e.cancelable) {
          e.preventDefault();
        }
        this.state.isResizing = true;
        this.state.startX = e.touches[0].clientX;
        this.state.startWidth = this.elements.container.offsetWidth;
        const onTouchMove = (ev: TouchEvent) => this.handleTouchMove(ev, index);
        const onTouchEnd = () => {
          this.handleTouchEnd();
          document.removeEventListener('touchmove', onTouchMove);
          document.removeEventListener('touchend', onTouchEnd);
        };
        document.addEventListener('touchmove', onTouchMove);
        document.addEventListener('touchend', onTouchEnd);
      },
      { passive: false }
    );
    return dot;
  }

  private handleMouseMove(e: MouseEvent, index: number): void {
    if (!this.state.isResizing) {
      return;
    }
    const deltaX = index % 2 === 0 ? -(e.clientX - this.state.startX) : e.clientX - this.state.startX;
    const newWidth = clampWidth(this.state.startWidth + deltaX, this.resizeLimits);
    const px = `${newWidth}px`;
    this.elements.container.style.width = px;
    this.elements.inner.style.width = px;
  }

  private handleTouchMove(e: TouchEvent, index: number): void {
    if (!this.state.isResizing) {
      return;
    }
    const deltaX =
      index % 2 === 0
        ? -(e.touches[0].clientX - this.state.startX)
        : e.touches[0].clientX - this.state.startX;
    const newWidth = clampWidth(this.state.startWidth + deltaX, this.resizeLimits);
    const px = `${newWidth}px`;
    this.elements.container.style.width = px;
    this.elements.inner.style.width = px;
  }

  private handleMouseUp(): void {
    if (this.state.isResizing) {
      this.state.isResizing = false;
    }
    this.dispatchNodeView();
  }

  private handleTouchEnd(): void {
    if (this.state.isResizing) {
      this.state.isResizing = false;
    }
    this.dispatchNodeView();
  }
}

function applyButtonVisuals(anchor: HTMLAnchorElement, attrs: Record<string, unknown>): void {
  const href = typeof attrs.href === 'string' ? attrs.href : '#';
  const buttonText = typeof attrs.buttonText === 'string' ? attrs.buttonText : 'Button';
  const textColor = typeof attrs.textColor === 'string' ? attrs.textColor : '#579DFF';
  const bgColor = typeof attrs.bgColor === 'string' ? attrs.bgColor : '#1D2125';
  const borderRadiusPx =
    typeof attrs.borderRadiusPx === 'number' && Number.isFinite(attrs.borderRadiusPx)
      ? attrs.borderRadiusPx
      : 4;
  const iconSrc = typeof attrs.iconSrc === 'string' && attrs.iconSrc.trim() !== '' ? attrs.iconSrc : '';
  const iconSizePx =
    typeof attrs.iconSizePx === 'number' && Number.isFinite(attrs.iconSizePx) ? attrs.iconSizePx : 16;
  const explicitWidth = normalizeWidthPx(attrs.width);

  anchor.setAttribute('href', href);
  anchor.setAttribute('class', 'card-desc-inline-button');
  anchor.setAttribute('target', '_blank');
  anchor.setAttribute('rel', 'noopener noreferrer');
  anchor.style.cssText = [
    'display: inline-flex',
    'align-items: center',
    'justify-content: center',
    'gap: 8px',
    'box-sizing: border-box',
    `width: ${explicitWidth ?? '320px'}`,
    'padding: 8px 14px',
    'text-decoration: none',
    `color: ${textColor}`,
    `background-color: ${bgColor}`,
    `border-radius: ${borderRadiusPx}px`,
    'font-size: var(--mantine-font-size-sm)',
    'font-weight: 500',
    'line-height: 1.2',
  ].join('; ');

  anchor.replaceChildren();
  if (iconSrc) {
    const img = document.createElement('img');
    img.src = iconSrc;
    img.alt = '';
    img.width = iconSizePx;
    img.height = iconSizePx;
    img.style.objectFit = 'contain';
    img.style.flexShrink = '0';
    anchor.appendChild(img);
  }
  const span = document.createElement('span');
  span.className = 'card-desc-inline-button__text';
  span.textContent = buttonText;
  anchor.appendChild(span);
}

class InlineButtonNodeView {
  private context: NodeViewContext;
  private readonly inline: boolean;
  private readonly resizeLimits: { minWidth?: number; maxWidth?: number };
  private readonly elements: ResizeElements;
  private onContainerClick: ((e: MouseEvent) => void) | null = null;
  private onDocumentClick: ((e: MouseEvent) => void) | null = null;
  private onInnerClick: ((e: MouseEvent) => void) | null = null;
  private onInnerDblClick: ((e: MouseEvent) => void) | null = null;

  constructor(
    context: NodeViewContext,
    inline: boolean,
    resizeLimits: { minWidth?: number; maxWidth?: number }
  ) {
    this.context = context;
    this.inline = inline;
    this.resizeLimits = resizeLimits;
    this.elements = {
      wrapper: document.createElement('div'),
      container: document.createElement('div'),
      inner: document.createElement('a'),
    };
    this.elements.wrapper.className = 'card-desc-inline-button-wrapper';
    this.elements.container.className = 'card-desc-inline-button-container';
  }

  private dispatchNodeView = (): void => {
    const { editor, getPos } = this.context;
    if (typeof getPos !== 'function') {
      return;
    }
    clearContainerBorder(this.elements.container);
    const pos = getPos();
    if (pos === undefined) {
      return;
    }
    const nodeAt = editor.state.doc.nodeAt(pos);
    if (nodeAt == null) {
      return;
    }
    const w =
      extractWidthFromStyle(this.elements.container.style.cssText) ??
      (typeof nodeAt.attrs.width === 'string' ? nodeAt.attrs.width : undefined);
    const wrapCss = this.elements.wrapper.style.cssText;
    const { x: ox, y: oy } = parseTranslatePx(wrapCss);
    const merged = {
      ...nodeAt.attrs,
      offsetXPx: clampOffset(ox),
      offsetYPx: clampOffset(oy),
      width: w ?? nodeAt.attrs.width,
      containerStyle: this.elements.container.style.cssText,
      wrapperStyle: stripTransformFromStyle(wrapCss),
    };
    const { state } = editor;
    editor.view.dispatch(state.tr.setNodeMarkup(pos, undefined, merged));
  };

  private removeResizeElements = (): void => {
    removeResizeElements(this.elements.container);
  };

  private applyResizeLimits(): void {
    let widthStr = extractWidthFromStyle(this.elements.container.style.cssText);
    if (widthStr == null && typeof this.context.node.attrs.width === 'string') {
      widthStr = this.context.node.attrs.width as string;
    }
    if (widthStr == null) {
      widthStr =
        this.resizeLimits.maxWidth !== undefined
          ? String(Math.min(320, this.resizeLimits.maxWidth))
          : '320';
    }
    const width = Number(widthStr);
    if (Number.isNaN(width)) {
      return;
    }
    const clamped = clampWidth(width, this.resizeLimits);
    const px = `${clamped}px`;
    this.elements.container.style.width = px;
    this.elements.inner.style.width = px;
  }

  /** Top drag strip: 2D translate on the wrapper (no image-style align bar — avoids blocking double-click). */
  private createMoveHandle(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.className = 'card-desc-inline-button-move-handle';
    bar.setAttribute('title', 'Drag to position');
    bar.setAttribute(
      'style',
      `position: absolute; left: 50%; top: 0; transform: translate(-50%, -110%); width: 40px; height: 10px; z-index: 1001; background-color: rgba(255, 255, 255, 0.95); border: 1px solid ${BORDER_COLOR}; border-radius: 3px; cursor: move; box-sizing: border-box; touch-action: none;`
    );

    const bindPointerDrag = (originX: number, originY: number, isTouch: boolean): void => {
      const attrs = this.context.node.attrs as Record<string, unknown>;
      const baseWs =
        typeof attrs.wrapperStyle === 'string' && attrs.wrapperStyle.trim() !== ''
          ? attrs.wrapperStyle
          : getWrapperStyle(this.inline);
      const { x: sx, y: sy } = readOffsetAttrs(attrs);

      const apply = (cx: number, cy: number): void => {
        const nx = clampOffset(sx + (cx - originX));
        const ny = clampOffset(sy + (cy - originY));
        this.elements.wrapper.setAttribute('style', buildWrapperStyleWithOffsets(baseWs, nx, ny));
      };

      const finish = (): void => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        document.removeEventListener('touchcancel', onTouchEnd);
        this.dispatchNodeView();
      };

      const onMouseMove = (ev: MouseEvent): void => {
        apply(ev.clientX, ev.clientY);
      };
      const onMouseUp = (): void => {
        finish();
      };
      const onTouchMove = (ev: TouchEvent): void => {
        const t = ev.touches[0];
        if (t) {
          if (ev.cancelable) {
            ev.preventDefault();
          }
          apply(t.clientX, t.clientY);
        }
      };
      const onTouchEnd = (): void => {
        finish();
      };

      if (isTouch) {
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
        document.addEventListener('touchcancel', onTouchEnd);
      } else {
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      }
    };

    bar.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      bindPointerDrag(e.clientX, e.clientY, false);
    });
    bar.addEventListener(
      'touchstart',
      (e) => {
        if (e.cancelable) {
          e.preventDefault();
        }
        e.stopPropagation();
        const t = e.touches[0];
        if (t) {
          bindPointerDrag(t.clientX, t.clientY, true);
        }
      },
      { passive: false }
    );

    return bar;
  }

  private setupContainerClick(editorEditable: boolean): void {
    if (!editorEditable) {
      return;
    }
    this.onContainerClick = () => {
      const pm = document.querySelector('.ProseMirror-focused');
      if (isMobile() && pm instanceof HTMLElement) {
        pm.blur();
      }
      this.removeResizeElements();
      const baseCs =
        typeof this.context.node.attrs.containerStyle === 'string'
          ? this.context.node.attrs.containerStyle
          : '';
      this.elements.container.setAttribute(
        'style',
        `position: relative; border: 1px dashed ${BORDER_COLOR}; ${baseCs}`
      );
      this.applyResizeLimits();
      const rh = new ResizeController(this.elements, this.dispatchNodeView, this.resizeLimits);
      for (let i = 0; i < 4; i++) {
        this.elements.container.appendChild(rh.createResizeHandle(i));
      }
      this.elements.container.appendChild(this.createMoveHandle());
    };
    this.elements.container.addEventListener('click', this.onContainerClick);

    this.onDocumentClick = (e) => {
      const target = e.target;
      if (!(target instanceof globalThis.Node)) {
        return;
      }
      const inside = this.elements.container.contains(target);
      if (!inside) {
        clearContainerBorder(this.elements.container);
        this.removeResizeElements();
      }
    };
    document.addEventListener('click', this.onDocumentClick);
  }

  private teardownListeners(): void {
    if (this.onContainerClick != null) {
      this.elements.container.removeEventListener('click', this.onContainerClick);
      this.onContainerClick = null;
    }
    if (this.onDocumentClick != null) {
      document.removeEventListener('click', this.onDocumentClick);
      this.onDocumentClick = null;
    }
    if (this.onInnerClick != null) {
      this.elements.inner.removeEventListener('click', this.onInnerClick);
      this.onInnerClick = null;
    }
    if (this.onInnerDblClick != null) {
      this.elements.inner.removeEventListener('dblclick', this.onInnerDblClick);
      this.onInnerDblClick = null;
    }
    this.removeResizeElements();
  }

  initialize(): { dom: HTMLElement; update?: (node: PMNode) => boolean; destroy?: () => void } {
    const attrs = this.context.node.attrs as Record<string, unknown>;
    const ws =
      typeof attrs.wrapperStyle === 'string' && attrs.wrapperStyle.trim() !== ''
        ? attrs.wrapperStyle
        : getWrapperStyle(this.inline);
    const { x: offX, y: offY } = readOffsetAttrs(attrs);
    const cs =
      typeof attrs.containerStyle === 'string' && attrs.containerStyle.trim() !== ''
        ? attrs.containerStyle
        : getContainerStyle(this.inline, '320px');

    this.elements.wrapper.setAttribute('style', buildWrapperStyleWithOffsets(ws, offX, offY));
    this.elements.wrapper.appendChild(this.elements.container);
    this.elements.container.setAttribute('style', cs);
    this.elements.container.appendChild(this.elements.inner);

    applyButtonVisuals(this.elements.inner, attrs);
    this.applyResizeLimits();

    const editable = this.context.editor.isEditable;
    this.onInnerClick = (e) => {
      if (editable) {
        e.preventDefault();
      }
    };
    this.elements.inner.addEventListener('click', this.onInnerClick);
    this.onInnerDblClick = (e) => {
      if (!editable) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const getPos = this.context.getPos;
      if (typeof getPos !== 'function') {
        return;
      }
      const p = getPos();
      if (p !== undefined) {
        this.context.editor.storage.inlineButton?.openEditModal?.(p);
      }
    };
    this.elements.inner.addEventListener('dblclick', this.onInnerDblClick);

    if (!editable) {
      return {
        dom: this.elements.wrapper,
        destroy: () => {
          this.teardownListeners();
        },
      };
    }
    this.setupContainerClick(true);
    const self = this;
    return {
      dom: this.elements.wrapper,
      update: (updatedNode: PMNode) => {
        if (updatedNode.type.name !== 'inlineButton') {
          return false;
        }
        self.context.node = updatedNode;
        applyButtonVisuals(self.elements.inner, updatedNode.attrs as Record<string, unknown>);
        const cs = updatedNode.attrs.containerStyle;
        const wsRaw = updatedNode.attrs.wrapperStyle;
        const baseWs =
          typeof wsRaw === 'string' && wsRaw.trim() !== ''
            ? wsRaw
            : getWrapperStyle(self.inline);
        const off = readOffsetAttrs(updatedNode.attrs as Record<string, unknown>);
        if (typeof cs === 'string' && cs.trim() !== '') {
          self.elements.container.setAttribute('style', cs);
        }
        self.elements.wrapper.setAttribute('style', buildWrapperStyleWithOffsets(baseWs, off.x, off.y));
        self.applyResizeLimits();
        return true;
      },
      destroy: () => {
        self.teardownListeners();
      },
    };
  }
}

export const DEFAULT_INLINE_BUTTON_ATTRS = {
  href: 'https://',
  buttonText: 'Button',
  textColor: '#579DFF',
  bgColor: '#1D2125',
  borderRadiusPx: 4,
  iconSrc: null as string | null,
  iconSizePx: 16,
  width: '320' as string | null,
  offsetXPx: 0,
  offsetYPx: 0,
  containerStyle: 'position: relative; width: 320px; height: auto; cursor: pointer; ',
  wrapperStyle: 'display: flex;',
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineButton: {
      insertInlineButton: () => ReturnType;
    };
  }

  interface Storage {
    inlineButton?: {
      openEditModal: (pos: number) => void;
    };
  }
}

export const TiptapInlineButton = TiptapNode.create({
  name: 'inlineButton',
  draggable: true,
  atom: true,
  group: 'block',
  inline: false,

  addStorage() {
    return {
      openEditModal: (_pos: number) => {
        /* assigned from CardDescriptionEditor */
      },
    };
  },

  addOptions() {
    return {
      inline: false,
      minWidth: 80,
      maxWidth: 800,
    };
  },

  addAttributes() {
    return {
      href: { default: DEFAULT_INLINE_BUTTON_ATTRS.href },
      buttonText: { default: DEFAULT_INLINE_BUTTON_ATTRS.buttonText },
      textColor: { default: DEFAULT_INLINE_BUTTON_ATTRS.textColor },
      bgColor: { default: DEFAULT_INLINE_BUTTON_ATTRS.bgColor },
      borderRadiusPx: { default: DEFAULT_INLINE_BUTTON_ATTRS.borderRadiusPx },
      iconSrc: { default: DEFAULT_INLINE_BUTTON_ATTRS.iconSrc },
      iconSizePx: { default: DEFAULT_INLINE_BUTTON_ATTRS.iconSizePx },
      width: { default: DEFAULT_INLINE_BUTTON_ATTRS.width },
      offsetXPx: { default: DEFAULT_INLINE_BUTTON_ATTRS.offsetXPx },
      offsetYPx: { default: DEFAULT_INLINE_BUTTON_ATTRS.offsetYPx },
      containerStyle: { default: DEFAULT_INLINE_BUTTON_ATTRS.containerStyle },
      wrapperStyle: { default: DEFAULT_INLINE_BUTTON_ATTRS.wrapperStyle },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a.card-desc-inline-button[data-inline-button]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }
          const st = element.getAttribute('style') ?? '';
          const { x, y } = parseTranslatePx(st);
          return {
            offsetXPx: clampOffset(x),
            offsetYPx: clampOffset(y),
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const {
      href,
      buttonText,
      textColor,
      bgColor,
      borderRadiusPx,
      iconSrc,
      iconSizePx,
      width,
      offsetXPx,
      offsetYPx,
    } = node.attrs as {
      href: string;
      buttonText: string;
      textColor: string;
      bgColor: string;
      borderRadiusPx: number;
      iconSrc: string | null;
      iconSizePx: number;
      width?: string | number | null;
      offsetXPx?: number;
      offsetYPx?: number;
    };
    const ox = clampOffset(typeof offsetXPx === 'number' ? offsetXPx : 0);
    const oy = clampOffset(typeof offsetYPx === 'number' ? offsetYPx : 0);
    const explicitWidth = normalizeWidthPx(width);
    const style = [
      'display: inline-flex',
      'align-items: center',
      'justify-content: center',
      'gap: 8px',
      'box-sizing: border-box',
      `width: ${explicitWidth ?? '320px'}`,
      'max-width: 100%',
      'align-self: flex-start',
      'padding: 8px 14px',
      'text-decoration: none',
      `color: ${textColor}`,
      `background-color: ${bgColor}`,
      `border-radius: ${borderRadiusPx}px`,
      'font-size: var(--mantine-font-size-sm)',
      'font-weight: 500',
      ox !== 0 || oy !== 0 ? `transform: translate(${ox}px, ${oy}px)` : '',
    ]
      .filter((s) => s !== '')
      .join('; ');
    const children: [string, Record<string, unknown>, ...unknown[]][] = [];
    if (typeof iconSrc === 'string' && iconSrc.trim() !== '') {
      children.push([
        'img',
        {
          src: iconSrc,
          alt: '',
          width: iconSizePx,
          height: iconSizePx,
          style: 'object-fit:contain;flex-shrink:0',
        },
      ]);
    }
    children.push(['span', { class: 'card-desc-inline-button__text' }, buttonText]);
    return [
      'a',
      mergeAttributes({
        class: 'card-desc-inline-button',
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
        'data-inline-button': '1',
        style,
      }),
      ...children,
    ];
  },

  renderText({ node }) {
    const t = node.attrs.buttonText;
    return typeof t === 'string' ? t : '';
  },

  addCommands() {
    return {
      insertInlineButton:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { ...DEFAULT_INLINE_BUTTON_ATTRS },
          });
        },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const { inline, minWidth, maxWidth } = this.options;
      const context: NodeViewContext = {
        node,
        editor,
        getPos: typeof getPos === 'function' ? getPos : undefined,
      };
      const nv = new InlineButtonNodeView(context, inline, { minWidth, maxWidth });
      return nv.initialize();
    };
  },
});
