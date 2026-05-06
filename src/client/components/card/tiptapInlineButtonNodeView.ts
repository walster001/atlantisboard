import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import {
  applyButtonVisuals,
  BORDER_COLOR,
  buildWrapperStyleWithOffsets,
  clampOffset,
  clampWidth,
  clearContainerBorder,
  extractWidthFromStyle,
  getContainerStyle,
  getDotStyle,
  getWrapperStyle,
  isMobile,
  parseTranslatePx,
  readOffsetAttrs,
  removeResizeElements,
  stripTransformFromStyle,
} from './tiptapInlineButtonHelpers.js';

export type NodeViewContext = {
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
    resizeLimits: { minWidth?: number; maxWidth?: number } = {},
  ) {
    this.elements = elements;
    this.dispatchNodeView = dispatchNodeView;
    this.resizeLimits = resizeLimits;
  }

  createResizeHandle(index: number): HTMLDivElement {
    const dot = document.createElement('div');
    dot.setAttribute('style', getDotStyle(index));
    dot.addEventListener('mousedown', (event) => {
      event.preventDefault();
      this.state.isResizing = true;
      this.state.startX = event.clientX;
      this.state.startWidth = this.elements.container.offsetWidth;
      const onMouseMove = (moveEvent: MouseEvent) => this.handleMouseMove(moveEvent, index);
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
      (event) => {
        if (event.cancelable) {
          event.preventDefault();
        }
        this.state.isResizing = true;
        this.state.startX = event.touches[0].clientX;
        this.state.startWidth = this.elements.container.offsetWidth;
        const onTouchMove = (moveEvent: TouchEvent) => this.handleTouchMove(moveEvent, index);
        const onTouchEnd = () => {
          this.handleTouchEnd();
          document.removeEventListener('touchmove', onTouchMove);
          document.removeEventListener('touchend', onTouchEnd);
        };
        document.addEventListener('touchmove', onTouchMove);
        document.addEventListener('touchend', onTouchEnd);
      },
      { passive: false },
    );
    return dot;
  }

  private handleMouseMove(event: MouseEvent, index: number): void {
    if (!this.state.isResizing) {
      return;
    }
    const deltaX =
      index % 2 === 0 ? -(event.clientX - this.state.startX) : event.clientX - this.state.startX;
    const newWidth = clampWidth(this.state.startWidth + deltaX, this.resizeLimits);
    const px = `${newWidth}px`;
    this.elements.container.style.width = px;
    this.elements.inner.style.width = px;
  }

  private handleTouchMove(event: TouchEvent, index: number): void {
    if (!this.state.isResizing) {
      return;
    }
    const deltaX =
      index % 2 === 0
        ? -(event.touches[0].clientX - this.state.startX)
        : event.touches[0].clientX - this.state.startX;
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

class InlineButtonNodeView {
  private context: NodeViewContext;
  private readonly inline: boolean;
  private readonly resizeLimits: { minWidth?: number; maxWidth?: number };
  private readonly elements: ResizeElements;
  private onContainerClick: ((event: MouseEvent) => void) | null = null;
  private onDocumentClick: ((event: MouseEvent) => void) | null = null;
  private onInnerClick: ((event: MouseEvent) => void) | null = null;
  private onInnerDblClick: ((event: MouseEvent) => void) | null = null;

  constructor(context: NodeViewContext, inline: boolean, resizeLimits: { minWidth?: number; maxWidth?: number }) {
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
    const width =
      extractWidthFromStyle(this.elements.container.style.cssText) ??
      (typeof nodeAt.attrs.width === 'string' ? nodeAt.attrs.width : undefined);
    const wrapCss = this.elements.wrapper.style.cssText;
    const { x: offsetX, y: offsetY } = parseTranslatePx(wrapCss);
    const merged = {
      ...nodeAt.attrs,
      offsetXPx: clampOffset(offsetX),
      offsetYPx: clampOffset(offsetY),
      width: width ?? nodeAt.attrs.width,
      containerStyle: this.elements.container.style.cssText,
      wrapperStyle: stripTransformFromStyle(wrapCss),
    };
    const { state } = editor;
    editor.view.dispatch(state.tr.setNodeMarkup(pos, undefined, merged));
  };

  private applyResizeLimits(): void {
    let widthStr = extractWidthFromStyle(this.elements.container.style.cssText);
    if (widthStr == null && typeof this.context.node.attrs.width === 'string') {
      widthStr = this.context.node.attrs.width as string;
    }
    if (widthStr == null) {
      widthStr =
        this.resizeLimits.maxWidth !== undefined ? String(Math.min(320, this.resizeLimits.maxWidth)) : '320';
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

  private createMoveHandle(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.className = 'card-desc-inline-button-move-handle';
    bar.setAttribute('title', 'Drag to position');
    bar.setAttribute(
      'style',
      `position: absolute; left: 50%; top: 0; transform: translate(-50%, -110%); width: 40px; height: 10px; z-index: 1001; background-color: rgba(255, 255, 255, 0.95); border: 1px solid ${BORDER_COLOR}; border-radius: 3px; cursor: move; box-sizing: border-box; touch-action: none;`,
    );

    const bindPointerDrag = (originX: number, originY: number, isTouch: boolean): void => {
      const attrs = this.context.node.attrs as Record<string, unknown>;
      const baseWrapperStyle =
        typeof attrs.wrapperStyle === 'string' && attrs.wrapperStyle.trim() !== ''
          ? attrs.wrapperStyle
          : getWrapperStyle(this.inline);
      const { x: sourceX, y: sourceY } = readOffsetAttrs(attrs);

      const apply = (currentX: number, currentY: number): void => {
        const nextX = clampOffset(sourceX + (currentX - originX));
        const nextY = clampOffset(sourceY + (currentY - originY));
        this.elements.wrapper.setAttribute(
          'style',
          buildWrapperStyleWithOffsets(baseWrapperStyle, nextX, nextY),
        );
      };

      const finish = (): void => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        document.removeEventListener('touchcancel', onTouchEnd);
        this.dispatchNodeView();
      };

      const onMouseMove = (moveEvent: MouseEvent): void => apply(moveEvent.clientX, moveEvent.clientY);
      const onMouseUp = (): void => finish();
      const onTouchMove = (moveEvent: TouchEvent): void => {
        const touch = moveEvent.touches[0];
        if (touch == null) {
          return;
        }
        if (moveEvent.cancelable) {
          moveEvent.preventDefault();
        }
        apply(touch.clientX, touch.clientY);
      };
      const onTouchEnd = (): void => finish();

      if (isTouch) {
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
        document.addEventListener('touchcancel', onTouchEnd);
      } else {
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      }
    };

    bar.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      bindPointerDrag(event.clientX, event.clientY, false);
    });
    bar.addEventListener(
      'touchstart',
      (event) => {
        if (event.cancelable) {
          event.preventDefault();
        }
        event.stopPropagation();
        const touch = event.touches[0];
        if (touch != null) {
          bindPointerDrag(touch.clientX, touch.clientY, true);
        }
      },
      { passive: false },
    );

    return bar;
  }

  private setupContainerClick(editorEditable: boolean): void {
    if (!editorEditable) {
      return;
    }
    this.onContainerClick = () => {
      const proseMirror = document.querySelector('.ProseMirror-focused');
      if (isMobile() && proseMirror instanceof HTMLElement) {
        proseMirror.blur();
      }
      removeResizeElements(this.elements.container);
      const baseContainerStyle =
        typeof this.context.node.attrs.containerStyle === 'string' ? this.context.node.attrs.containerStyle : '';
      this.elements.container.setAttribute(
        'style',
        `position: relative; border: 1px dashed ${BORDER_COLOR}; ${baseContainerStyle}`,
      );
      this.applyResizeLimits();
      const resizeController = new ResizeController(this.elements, this.dispatchNodeView, this.resizeLimits);
      for (let index = 0; index < 4; index += 1) {
        this.elements.container.appendChild(resizeController.createResizeHandle(index));
      }
      this.elements.container.appendChild(this.createMoveHandle());
    };
    this.elements.container.addEventListener('click', this.onContainerClick);

    this.onDocumentClick = (event) => {
      const target = event.target;
      if (!(target instanceof globalThis.Node)) {
        return;
      }
      const inside = this.elements.container.contains(target);
      if (!inside) {
        clearContainerBorder(this.elements.container);
        removeResizeElements(this.elements.container);
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
    removeResizeElements(this.elements.container);
  }

  initialize(): { dom: HTMLElement; update?: (node: PMNode) => boolean; destroy?: () => void } {
    const attrs = this.context.node.attrs as Record<string, unknown>;
    const wrapperStyle =
      typeof attrs.wrapperStyle === 'string' && attrs.wrapperStyle.trim() !== ''
        ? attrs.wrapperStyle
        : getWrapperStyle(this.inline);
    const { x: offsetX, y: offsetY } = readOffsetAttrs(attrs);
    const containerStyle =
      typeof attrs.containerStyle === 'string' && attrs.containerStyle.trim() !== ''
        ? attrs.containerStyle
        : getContainerStyle(this.inline, '320px');

    this.elements.wrapper.setAttribute('style', buildWrapperStyleWithOffsets(wrapperStyle, offsetX, offsetY));
    this.elements.wrapper.appendChild(this.elements.container);
    this.elements.container.setAttribute('style', containerStyle);
    this.elements.container.appendChild(this.elements.inner);

    applyButtonVisuals(this.elements.inner, attrs);
    this.applyResizeLimits();

    const editable = this.context.editor.isEditable;
    this.onInnerClick = (event) => {
      if (editable) {
        event.preventDefault();
      }
    };
    this.elements.inner.addEventListener('click', this.onInnerClick);
    this.onInnerDblClick = (event) => {
      if (!editable) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const getPos = this.context.getPos;
      if (typeof getPos !== 'function') {
        return;
      }
      const pos = getPos();
      if (pos !== undefined) {
        this.context.editor.storage.inlineButton?.openEditModal?.(pos);
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
        const containerStyleAttr = updatedNode.attrs.containerStyle;
        const wrapperStyleRaw = updatedNode.attrs.wrapperStyle;
        const baseWrapperStyle =
          typeof wrapperStyleRaw === 'string' && wrapperStyleRaw.trim() !== ''
            ? wrapperStyleRaw
            : getWrapperStyle(self.inline);
        const offset = readOffsetAttrs(updatedNode.attrs as Record<string, unknown>);
        if (typeof containerStyleAttr === 'string' && containerStyleAttr.trim() !== '') {
          self.elements.container.setAttribute('style', containerStyleAttr);
        }
        self.elements.wrapper.setAttribute(
          'style',
          buildWrapperStyleWithOffsets(baseWrapperStyle, offset.x, offset.y),
        );
        self.applyResizeLimits();
        return true;
      },
      destroy: () => {
        self.teardownListeners();
      },
    };
  }
}

export function createInlineButtonNodeView(
  context: NodeViewContext,
  inline: boolean,
  resizeLimits: { minWidth?: number; maxWidth?: number },
): { dom: HTMLElement; update?: (node: PMNode) => boolean; destroy?: () => void } {
  return new InlineButtonNodeView(context, inline, resizeLimits).initialize();
}
